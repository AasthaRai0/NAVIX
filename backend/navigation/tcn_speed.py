import torch
import torch.nn as nn
import numpy as np
from pathlib import Path

class SpeedTCN(nn.Module):
    """
    Lightweight Temporal Convolutional Network.
    Input: [batch, 6, window]
    Features:
      accel_x, accel_y, accel_z,
      gyro_yaw, gyro_pitch, gyro_roll
    Output: vehicle speed in m/s.
    """
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(6, 32, 5, padding=2),
            nn.ReLU(),
            nn.Conv1d(32, 32, 5, padding=2, dilation=1),
            nn.ReLU(),
            nn.Conv1d(32, 64, 5, padding=4, dilation=2),
            nn.ReLU(),
            nn.Conv1d(64, 64, 5, padding=8, dilation=4),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1)
        )

    def forward(self, x):
        return self.head(self.net(x)).squeeze(-1)


class TCNSpeedModel:
    def __init__(self, model_path="data/speed_tcn.pt", norm_path="data/speed_norm.npz"):
        self.model = SpeedTCN()
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)
        self.model.eval()
        self.mean = np.zeros(6, dtype=np.float32)
        self.std = np.ones(6, dtype=np.float32)
        self.ready = False

        if Path(norm_path).exists():
            n = np.load(norm_path)
            self.mean = n["mean"].astype(np.float32)
            self.std = np.maximum(n["std"].astype(np.float32), 1e-6)

        if Path(model_path).exists():
            state = torch.load(model_path, map_location=self.device)
            self.model.load_state_dict(state)
            self.ready = True

    def predict(self, window):
        x = np.asarray(window, dtype=np.float32)
        if x.shape != (100, 6):
            raise ValueError(f"TCN expects (100,6), got {x.shape}")
        x = (x - self.mean) / self.std
        tensor = torch.from_numpy(x.T[None]).to(self.device)
        with torch.no_grad():
            speed = float(self.model(tensor).item())
        return max(0.0, speed)
