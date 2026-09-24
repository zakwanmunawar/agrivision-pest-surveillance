import os
import torch
from ultralytics import YOLO

def main():
    device = 0 if torch.cuda.is_available() else "cpu"
    print(f"[SYSTEM] Device: {device} ({torch.cuda.get_device_name(0)})")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_yaml_path = os.path.join(base_dir, "Insects-1", "data.yaml")

    if not os.path.exists(data_yaml_path):
        raise FileNotFoundError(f"Missing data.yaml at: {data_yaml_path}")

    print(f"[FOUND] Verified config: {data_yaml_path}")

    # Load YOLO26 Nano
    model = YOLO("yolo26n.pt")

    # Windows-safe high-mAP training configuration
    model.train(
        data=data_yaml_path,
        epochs=80,
        patience=15,
        imgsz=640,
        batch=16,
        device=device,
        workers=0,             # Critical on Windows: eliminates DataLoader subprocess MemoryErrors
        optimizer="AdamW",     # High convergence for small objects
        lr0=0.002,
        lrf=0.01,
        close_mosaic=10,       # Sharp final regression
        name="pest_run_optimized",
        exist_ok=True
    )

    print("[SUCCESS] Training finished! Best weights: runs/detect/pest_run_optimized/weights/best.pt")

if __name__ == "__main__":
    main()
