import os
import json
import time
import cv2
import torch
import paho.mqtt.client as mqtt
import supervision as sv
from ultralytics import YOLO

# --- MQTT SETUP (v2 API compliant) ---
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_TOPIC = "agritech/pest/alerts"

mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
    print(f"[MQTT] Connected to {MQTT_BROKER} on topic: {MQTT_TOPIC}")
except Exception as e:
    print(f"[MQTT WARN] Could not reach broker: {e}. Running local tracking only.")

def run_detection(video_source=0):
    weights_path = os.path.join("runs", "detect", "pest_run_optimized", "weights", "best.pt")
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Missing model weights at: {weights_path}")

    print(f"[INIT] Loading custom model: {weights_path}")
    model = YOLO(weights_path)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"[INIT] Inference Device: {device} ({torch.cuda.get_device_name(0)})")

    # Supervision tracker & annotators
    tracker = sv.ByteTrack()
    box_annotator = sv.BoxAnnotator(thickness=2)
    label_annotator = sv.LabelAnnotator(text_scale=0.5, text_padding=5)

    cap = cv2.VideoCapture(video_source)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video source: {video_source}")
        return

    tracked_pests = set()
    print("[SYSTEM] Streaming started. Press 'q' to exit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[INFO] Video feed ended or camera unavailable.")
            break

        # 1. YOLO inference
        results = model(frame, device=device, conf=0.35, verbose=False)[0]

        # 2. Convert detections to Supervision format
        detections = sv.Detections.from_ultralytics(results)

        # 3. Associate tracking IDs across frames
        detections = tracker.update_with_detections(detections)

        labels = []
        if detections.tracker_id is not None:
            for class_id, tracker_id, conf in zip(detections.class_id, detections.tracker_id, detections.confidence):
                class_name = model.names[class_id]
                labels.append(f"#{tracker_id} {class_name} ({conf:.2f})")

                # New pest entry trigger: emit MQTT telemetry once per unique track ID
                if tracker_id not in tracked_pests:
                    tracked_pests.add(tracker_id)
                    payload = {
                        "event": "PEST_DETECTED",
                        "track_id": int(tracker_id),
                        "pest_type": class_name,
                        "confidence": round(float(conf), 3),
                        "timestamp": time.time(),
                        "sensor_id": "cam_node_01"
                    }
                    mqtt_client.publish(MQTT_TOPIC, json.dumps(payload))
                    print(f"[MQTT ALERT SENT] -> #{tracker_id} {class_name} ({conf:.2f})")

        # 4. Annotate bounding boxes and track labels
        annotated_frame = box_annotator.annotate(scene=frame.copy(), detections=detections)
        annotated_frame = label_annotator.annotate(scene=annotated_frame, detections=detections, labels=labels)

        # 5. Display on-screen HUD
        hud_text = f"Pests Tracked: {len(tracked_pests)}"
        cv2.rectangle(annotated_frame, (10, 10), (280, 50), (0, 0, 0), -1)
        cv2.putText(annotated_frame, hud_text, (20, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        cv2.imshow("Automated Pest Surveillance", annotated_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    mqtt_client.loop_stop()

if __name__ == "__main__":
    run_detection(0)