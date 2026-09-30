from pathlib import Path
import numpy as np
import pandas as pd
import torch
from navigation.tcn_speed import SpeedTCN

DATA = Path("data/S1_synchronized.csv")
OUT_MODEL = Path("data/speed_tcn.pt")
OUT_NORM = Path("data/speed_norm.npz")
WINDOW = 100

FEATURES = [
    "acc_x", "acc_y", "acc_z",
    "gyro_yaw", "gyro_pitch", "gyro_roll"
]

def main():
    if not DATA.exists():
        raise FileNotFoundError(f"Missing {DATA}")

    df = pd.read_csv(DATA)

    required = FEATURES + ["vehicle_velocity"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    X = df[FEATURES].astype("float32").to_numpy()
    y = (df["vehicle_velocity"].astype("float32").to_numpy() / 3.6)

    n = len(df)
    split = int(n * 0.8)

    # Chronological split prevents future samples leaking into training.
    train_X = X[:split]
    train_y = y[:split]

    mean = train_X.mean(axis=0)
    std = train_X.std(axis=0)
    std[std < 1e-6] = 1.0

    def make_windows(a, b):
        xs, ys = [], []
        for i in range(WINDOW - 1, len(a)):
            xs.append(a[i-WINDOW+1:i+1])
            ys.append(b[i])
        return np.asarray(xs, np.float32), np.asarray(ys, np.float32)

    Xtr, ytr = make_windows(train_X, train_y)
    Xte, yte = make_windows(X[split:], y[split:])

    Xtr = (Xtr - mean) / std
    Xte = (Xte - mean) / std

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = SpeedTCN().to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    loss_fn = torch.nn.HuberLoss()

    Xt = torch.from_numpy(Xtr.transpose(0,2,1)).to(device)
    yt = torch.from_numpy(ytr).to(device)

    for epoch in range(20):
        model.train()
        opt.zero_grad()
        pred = model(Xt)
        loss = loss_fn(pred, yt)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        print(f"epoch {epoch+1:02d}/20  train_loss={loss.item():.5f}")

    model.eval()
    with torch.no_grad():
        pred = model(torch.from_numpy(Xte.transpose(0,2,1)).to(device)).cpu().numpy()
    mae = float(np.mean(np.abs(pred - yte)))
    rmse = float(np.sqrt(np.mean((pred - yte)**2)))

    OUT_MODEL.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), OUT_MODEL)
    np.savez(OUT_NORM, mean=mean, std=std)

    print(f"\nSaved: {OUT_MODEL}")
    print(f"Saved: {OUT_NORM}")
    print(f"Validation MAE : {mae:.3f} m/s")
    print(f"Validation RMSE: {rmse:.3f} m/s")

if __name__ == "__main__":
    main()
