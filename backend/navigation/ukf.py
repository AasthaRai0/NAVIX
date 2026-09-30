import math
import numpy as np

def wrap_angle(a):
    return (a + math.pi) % (2 * math.pi) - math.pi

class UKF:
    """
    State = [east_m, north_m, speed_mps, heading_rad]

    Heading convention:
      0 rad = north
      +pi/2 = east
    Gyro yaw is rad/s.
    """
    def __init__(self):
        self.x = np.zeros(4, dtype=float)
        self.P = np.diag([25.0, 25.0, 4.0, 0.20])
        self.Q = np.diag([0.02, 0.02, 0.30, 0.02])
        self.initialized = False

    def initialize(self, east, north, speed, heading):
        self.x[:] = [east, north, max(0.0, speed), wrap_angle(heading)]
        self.P = np.diag([4.0, 4.0, 1.0, 0.10])
        self.initialized = True

    def _sigma_points(self):
        n = 4
        lam = 1.0
        S = np.linalg.cholesky((n + lam) * self.P + 1e-9*np.eye(n))
        pts = [self.x.copy()]
        for i in range(n):
            pts.append(self.x + S[:, i])
            pts.append(self.x - S[:, i])
        return np.array(pts)

    def predict(self, speed_mps, gyro_yaw_rad_s, dt):
        if not self.initialized:
            return self.x.copy()

        dt = max(0.001, min(float(dt), 1.0))
        sigma = self._sigma_points()

        propagated = []
        for s in sigma:
            e, n, v, h = s
            # AI speed + gyro heading form the dead-reckoning motion model.
            h2 = wrap_angle(h + gyro_yaw_rad_s * dt)
            e2 = e + v * math.sin(h2) * dt
            n2 = n + v * math.cos(h2) * dt
            propagated.append([e2, n2, max(0.0, v), h2])

        propagated = np.asarray(propagated)
        n = 4
        lam = 1.0
        wm0 = lam/(n+lam)
        wc0 = wm0
        wi = 1/(2*(n+lam))

        xnew = np.average(propagated, axis=0, weights=[wm0] + [wi]*(2*n))
        # Circular mean for heading
        angles = propagated[:,3]
        w = np.array([wm0] + [wi]*(2*n))
        xnew[3] = math.atan2(np.sum(w*np.sin(angles)), np.sum(w*np.cos(angles)))

        Pnew = np.zeros((n,n))
        for i,s in enumerate(propagated):
            d = s - xnew
            d[3] = wrap_angle(d[3])
            ww = wc0 if i == 0 else wi
            Pnew += ww * np.outer(d,d)
        Pnew += self.Q * dt

        self.x = xnew
        self.P = Pnew
        return self.x.copy()

    def update_gnss(self, east, north, trust):
        if not self.initialized:
            self.initialize(east, north, 0.0, self.x[3])
            return self.x.copy()

        trust = float(np.clip(trust, 0.0, 1.0))
        if trust < 0.08:
            return self.x.copy()

        z = np.array([east, north])
        H = np.array([[1,0,0,0],[0,1,0,0]], dtype=float)
        R = np.eye(2) * (3.0 + 40.0*(1.0-trust))**2

        y = z - H @ self.x
        S = H @ self.P @ H.T + R
        K = self.P @ H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        self.x[3] = wrap_angle(self.x[3])
        self.P = (np.eye(4) - K @ H) @ self.P
        return self.x.copy()
