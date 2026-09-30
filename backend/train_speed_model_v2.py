from pathlib import Path
import random
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from navigation.tcn_speed import SpeedTCN

DATA=Path('data/S1_synchronized.csv')
OUT_MODEL=Path('data/speed_tcn.pt')
OUT_NORM=Path('data/speed_norm.npz')
WINDOW=100
BATCH_SIZE=1024
EPOCHS=5
LR=3e-4
WEIGHT_DECAY=1e-4
PATIENCE=7
SEED=42
FEATURES=['acc_x','acc_y','acc_z','gyro_yaw','gyro_pitch','gyro_roll']

def seed_all(s):
    random.seed(s); np.random.seed(s); torch.manual_seed(s)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(s)

def windows(x,y):
    n=len(x)-WINDOW+1
    shape=(n,WINDOW,x.shape[1])
    sw=np.lib.stride_tricks.sliding_window_view(x, WINDOW, axis=0)
    # sliding_window_view gives (n, features, window) for axis=0
    sw=np.moveaxis(sw,1,2)
    return np.ascontiguousarray(sw,dtype=np.float32), y[WINDOW-1:].astype(np.float32)

def main():
    seed_all(SEED)
    df=pd.read_csv(DATA)
    X=df[FEATURES].astype('float32').to_numpy()
    y=df['vehicle_velocity'].astype('float32').to_numpy()/3.6
    valid=np.isfinite(X).all(axis=1)&np.isfinite(y)
    X,y=X[valid],y[valid]
    split=int(len(X)*.8)
    trX,trY=X[:split],y[:split]
    vaX,vaY=X[split:],y[split:]
    mean=trX.mean(0).astype('float32'); std=trX.std(0).astype('float32'); std[std<1e-6]=1
    trX=np.clip((trX-mean)/std,-8,8); vaX=np.clip((vaX-mean)/std,-8,8)
    Xtr,ytr=windows(trX,trY); Xva,yva=windows(vaX,vaY)
    print(f'rows={len(X)} train={len(Xtr)} val={len(Xva)}')
    device='cuda' if torch.cuda.is_available() else 'cpu'; print('device=',device)
    train=DataLoader(TensorDataset(torch.from_numpy(Xtr.transpose(0,2,1)),torch.from_numpy(ytr)),batch_size=BATCH_SIZE,shuffle=True)
    val=DataLoader(TensorDataset(torch.from_numpy(Xva.transpose(0,2,1)),torch.from_numpy(yva)),batch_size=1024,shuffle=False)
    model=SpeedTCN().to(device)
    opt=torch.optim.AdamW(model.parameters(),lr=LR,weight_decay=WEIGHT_DECAY)
    sched=torch.optim.lr_scheduler.ReduceLROnPlateau(opt,mode='min',factor=.5,patience=2,min_lr=1e-5)
    loss_fn=nn.SmoothL1Loss(beta=1.0)
    best=float('inf'); best_rmse=float('inf'); best_state=None; stale=0
    for ep in range(1,EPOCHS+1):
        model.train(); losses=[]
        for xb,yb in train:
            xb,yb=xb.to(device),yb.to(device); opt.zero_grad(set_to_none=True)
            loss=loss_fn(model(xb),yb); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); opt.step(); losses.append(loss.item())
        model.eval(); ps=[]; ys=[]
        with torch.no_grad():
            for xb,yb in val:
                ps.append(model(xb.to(device)).cpu().numpy()); ys.append(yb.numpy())
        p=np.concatenate(ps); yy=np.concatenate(ys)
        mae=float(np.mean(np.abs(p-yy))); rmse=float(np.sqrt(np.mean((p-yy)**2)))
        sched.step(mae); lr=opt.param_groups[0]['lr']
        print(f'epoch {ep:02d}/{EPOCHS} train={np.mean(losses):.5f} val_MAE={mae:.3f}m/s ({mae*3.6:.2f}km/h) RMSE={rmse:.3f} lr={lr:.6f}')
        if mae<best:
            best,best_rmse=mae,rmse; best_state={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}; stale=0
            print('  -> BEST')
        else: stale+=1
        if stale>=PATIENCE:
            print('early stopping'); break
    model.load_state_dict(best_state)
    torch.save(model.state_dict(),OUT_MODEL); np.savez(OUT_NORM,mean=mean,std=std)
    print(f'BEST MAE={best:.3f} m/s = {best*3.6:.2f} km/h')
    print(f'BEST RMSE={best_rmse:.3f} m/s = {best_rmse*3.6:.2f} km/h')
    print('saved',OUT_MODEL,OUT_NORM)
if __name__=='__main__': main()
