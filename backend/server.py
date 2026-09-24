import json
import asyncio
import io
import csv
import os
import time
import shutil
import tempfile
import cv2
import numpy as np
import torch
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import paho.mqtt.client as mqtt
import supervision as sv
from ultralytics import YOLO

from .database import init_db, insert_detection, fetch_recent_detections, fetch_stats

WEIGHTS_PATH = os.path.join("runs", "detect", "pest_run_optimized", "weights", "best.pt")
model = None
device = "cuda:0" if torch.cuda.is_available() else "cpu"

MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_TOPIC = "agritech/pest/alerts"

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static_outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# High-visibility styling configurations
COLOR_PALETTE = sv.ColorPalette.DEFAULT
box_annotator = sv.BoxAnnotator(
    color=COLOR_PALETTE,
    thickness=4
)
label_annotator = sv.LabelAnnotator(
    color=COLOR_PALETTE,
    text_scale=0.75,
    text_thickness=2,
    text_padding=8,
    text_position=sv.Position.TOP_LEFT
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()
loop = None

def on_message(client, userdata, message):
    try:
        payload = json.loads(message.payload.decode())
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(handle_incoming_detection(payload), loop)
    except Exception as e:
        print(f"[MQTT INGEST ERROR] {e}")

async def handle_incoming_detection(data: dict):
    await insert_detection(
        track_id=data.get("track_id", 0),
        pest_type=data.get("pest_type", "unknown"),
        confidence=data.get("confidence", 0.0),
        sensor_id=data.get("sensor_id", "cam_node_01"),
        timestamp=data.get("timestamp", 0.0)
    )
    await manager.broadcast(data)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop, model
    loop = asyncio.get_running_loop()
    await init_db()

    if os.path.exists(WEIGHTS_PATH):
        print(f"[INIT] Loading YOLO model on {device}: {WEIGHTS_PATH}")
        model = YOLO(WEIGHTS_PATH)
    else:
        print(f"[WARN] Custom weights not found, using base model.")
        model = YOLO("yolo26n.pt")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_message
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        client.subscribe(MQTT_TOPIC)
        client.loop_start()
        print(f"[FASTAPI LIFESPAN] Subscribed to MQTT topic: {MQTT_TOPIC}")
    except Exception as e:
        print(f"[FASTAPI MQTT WARN] Broker connect failed: {e}")

    yield

    client.loop_stop()
    client.disconnect()

app = FastAPI(title="Pest Detection Telemetry Hub", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "pest-telemetry-backend", "device": device}

@app.get("/api/detections")
async def get_detections(limit: int = 50):
    return await fetch_recent_detections(limit)

@app.get("/api/stats")
async def get_stats():
    return await fetch_stats()

@app.get("/api/export/csv")
async def export_detections_csv():
    records = await fetch_recent_detections(limit=500)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "track_id", "pest_type", "confidence", "sensor_id", "timestamp"])
    writer.writeheader()
    for row in records:
        writer.writerow(row)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pest_detections_report.csv"}
    )

@app.post("/api/analyze/image")
async def analyze_image(file: UploadFile = File(...)):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return JSONResponse(status_code=400, content={"error": "Invalid image format"})

    results = model(frame, device=device, conf=0.25, verbose=False)[0]
    detections = sv.Detections.from_ultralytics(results)

    found_pests = []
    if len(detections) > 0:
        for class_id, conf, box in zip(detections.class_id, detections.confidence, detections.xyxy):
            name = model.names[class_id]
            found_pests.append({
                "species": name,
                "confidence": round(float(conf), 3),
                "box": [round(float(coord), 1) for coord in box]
            })
            payload = {
                "track_id": int(time.time() * 1000) % 10000,
                "pest_type": name,
                "confidence": round(float(conf), 3),
                "sensor_id": "dashboard_upload",
                "timestamp": time.time()
            }
            await handle_incoming_detection(payload)

    labels = [f"{p['species']} ({p['confidence']:.2f})" for p in found_pests]
    
    annotated = box_annotator.annotate(scene=frame.copy(), detections=detections)
    if labels:
        annotated = label_annotator.annotate(scene=annotated, detections=detections, labels=labels)

    _, encoded_img = cv2.imencode(".jpg", annotated)
    
    return Response(
        content=encoded_img.tobytes(),
        media_type="image/jpeg",
        headers={"X-Detections-Count": str(len(found_pests))}
    )

@app.post("/api/analyze/video")
async def analyze_video(file: UploadFile = File(...)):
    temp_in = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    shutil.copyfileobj(file.file, temp_in)
    temp_in.close()

    ts = int(time.time())
    output_filename = f"processed_{ts}.mp4"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    cap = cv2.VideoCapture(temp_in.name)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

    fourcc_options = ['avc1', 'H264', 'X264', 'mp4v']
    out = None
    for codec in fourcc_options:
        try:
            fourcc = cv2.VideoWriter_fourcc(*codec)
            test_out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
            if test_out.isOpened():
                out = test_out
                break
        except Exception:
            continue

    if out is None or not out.isOpened():
        out = cv2.VideoWriter(output_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (width, height))

    tracker = sv.ByteTrack(track_activation_threshold=0.20, lost_track_buffer=45)

    tracked_ids = set()
    detected_species = set()

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        results = model(frame, device=device, conf=0.18, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(results)
        detections = tracker.update_with_detections(detections)

        labels = []
        if detections.tracker_id is not None and len(detections.tracker_id) > 0:
            for class_id, tracker_id, conf in zip(detections.class_id, detections.tracker_id, detections.confidence):
                class_name = model.names[class_id]
                labels.append(f"#{tracker_id} {class_name.upper()} | {conf:.2f}")
                detected_species.add(class_name)

                if tracker_id not in tracked_ids:
                    tracked_ids.add(tracker_id)
                    payload = {
                        "track_id": int(tracker_id),
                        "pest_type": class_name,
                        "confidence": round(float(conf), 3),
                        "sensor_id": "video_console_run",
                        "timestamp": time.time()
                    }
                    await handle_incoming_detection(payload)

        annotated = box_annotator.annotate(scene=frame.copy(), detections=detections)
        if labels:
            annotated = label_annotator.annotate(scene=annotated, detections=detections, labels=labels)
        out.write(annotated)

    cap.release()
    out.release()
    try:
        os.remove(temp_in.name)
    except Exception:
        pass

    return {
        "status": "success",
        "video_url": f"http://127.0.0.1:8000/outputs/{output_filename}?t={ts}",
        "unique_pests": len(tracked_ids),
        "species_found": list(detected_species)
    }

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
