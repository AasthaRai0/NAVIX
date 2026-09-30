import math
import numpy as np

class OrientationCalibrator:
    """
    Phone / Sensor Orientation Calibrator.
    Smartphones placed in vehicles often have arbitrary tilt (pitch and roll).
    This calibrator estimates pitch (theta) and roll (phi) from accelerometer/gravity
    data and rotates raw IMU angular rates and accelerations into the level vehicle frame.
    """
    def __init__(self, alpha=0.98):
        self.alpha = alpha  # complementary filter factor
        self.pitch = 0.0    # rad
        self.roll = 0.0     # rad
        self.calibrated = False

    def calibrate_initial(self, acc_x, acc_y, acc_z):
        """Estimate pitch and roll from static gravity vector."""
        norm = math.sqrt(acc_x**2 + acc_y**2 + acc_z**2)
        if norm < 1e-3:
            return 0.0, 0.0
        
        # Roll = rotation around X-axis, Pitch = rotation around Y-axis
        roll = math.atan2(acc_y, acc_z)
        pitch = math.atan2(-acc_x, math.sqrt(acc_y**2 + acc_z**2))
        
        self.roll = roll
        self.pitch = pitch
        self.calibrated = True
        return pitch, roll

    def transform_imu(self, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z, dt=0.1):
        """
        Transforms raw IMU accelerations and gyroscopes from phone frame
        to vehicle-aligned horizontal frame using current pitch & roll.
        """
        if not self.calibrated:
            self.calibrate_initial(acc_x, acc_y, acc_z)

        # Update tilt using complementary filter if dt > 0
        if dt > 0:
            acc_roll = math.atan2(acc_y, acc_z)
            acc_pitch = math.atan2(-acc_x, math.sqrt(acc_y**2 + acc_z**2))

            self.roll = self.alpha * (self.roll + gyro_x * dt) + (1.0 - self.alpha) * acc_roll
            self.pitch = self.alpha * (self.pitch + gyro_y * dt) + (1.0 - self.alpha) * acc_pitch

        cr, sr = math.cos(self.roll), math.sin(self.roll)
        cp, sp = math.cos(self.pitch), math.sin(self.pitch)

        # Rotation matrix from IMU frame to horizontal vehicle frame R = Ry(pitch) * Rx(roll)
        R = np.array([
            [cp, sr * sp, cr * sp],
            [0,  cr,      -sr],
            [-sp, sr * cp, cr * cp]
        ], dtype=float)

        acc_raw = np.array([acc_x, acc_y, acc_z])
        gyro_raw = np.array([gyro_x, gyro_y, gyro_z])

        acc_veh = R @ acc_raw
        gyro_veh = R @ gyro_raw

        return {
            "acc_x": float(acc_veh[0]),
            "acc_y": float(acc_veh[1]),
            "acc_z": float(acc_veh[2]),
            "gyro_yaw": float(gyro_veh[2]),  # yaw rate in vehicle level frame
            "pitch_deg": math.degrees(self.pitch),
            "roll_deg": math.degrees(self.roll),
        }
