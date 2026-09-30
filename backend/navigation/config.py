from dataclasses import dataclass

@dataclass
class Config:
    window_size: int = 100          # 1 second at 100 Hz
    gps_max_age_s: float = 2.0
    strong_gps_accuracy_m: float = 8.0
    weak_gps_accuracy_m: float = 30.0
    outage_trust_threshold: float = 0.25
    model_path: str = "data/speed_tcn.pt"
    norm_path: str = "data/speed_norm.npz"
