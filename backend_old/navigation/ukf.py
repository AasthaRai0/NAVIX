import numpy as np


class UKF:

    def __init__(self, dt=0.1):

        self.dt = dt

        # State:
        # [x, y, speed, heading]
        self.x = np.zeros(4)

        # State covariance
        self.P = np.diag([
            5.0,     # x
            5.0,     # y
            1.0,     # speed
            0.05     # heading
        ])

        # Process noise
        self.Q = np.diag([
            0.05,    # x
            0.05,    # y
            0.2,     # speed
            0.01     # heading
        ])

        # GPS measurement noise
        self.R = np.diag([
            10.0,
            10.0
        ])

        # UKF parameters
        self.alpha = 0.1
        self.beta = 2.0
        self.kappa = 0.0

        self.n = 4

        self.lambda_ = (
            self.alpha ** 2 *
            (self.n + self.kappa)
            - self.n
        )

        self.gamma = np.sqrt(
            self.n + self.lambda_
        )

        # Weights
        self.Wm = np.full(
            2 * self.n + 1,
            1.0 / (2 * (self.n + self.lambda_))
        )

        self.Wc = self.Wm.copy()

        self.Wm[0] = (
            self.lambda_ /
            (self.n + self.lambda_)
        )

        self.Wc[0] = (
            self.Wm[0]
            + 1
            - self.alpha ** 2
            + self.beta
        )

    # --------------------------------
    # Normalize angle
    # --------------------------------
    def normalize_angle(self, angle):

        return (
            angle + np.pi
        ) % (2 * np.pi) - np.pi

    # --------------------------------
    # Sigma points
    # --------------------------------
    def sigma_points(self):

        P = (
            self.P +
            self.P.T
        ) / 2.0

        P += np.eye(self.n) * 1e-8

        try:
            L = np.linalg.cholesky(P)

        except np.linalg.LinAlgError:

            eigenvalues, eigenvectors = np.linalg.eigh(P)

            eigenvalues = np.maximum(
                eigenvalues,
                1e-8
            )

            P = (
                eigenvectors
                @ np.diag(eigenvalues)
                @ eigenvectors.T
            )

            L = np.linalg.cholesky(P)

        sigma = np.zeros(
            (2 * self.n + 1, self.n)
        )

        sigma[0] = self.x

        for i in range(self.n):

            sigma[i + 1] = (
                self.x
                + self.gamma * L[:, i]
            )

            sigma[i + 1 + self.n] = (
                self.x
                - self.gamma * L[:, i]
            )

        return sigma

    # --------------------------------
    # Motion model
    # --------------------------------
    def motion_model(
        self,
        state,
        speed,
        gyro_z
    ):

        x, y, _, heading = state

        dt = self.dt

        # Vehicle moves forward
        new_x = (
            x
            + speed
            * np.cos(heading)
            * dt
        )

        new_y = (
            y
            + speed
            * np.sin(heading)
            * dt
        )

        # Gyroscope updates heading
        new_heading = (
            heading
            + gyro_z * dt
        )

        new_heading = self.normalize_angle(
            new_heading
        )

        return np.array([
            new_x,
            new_y,
            speed,
            new_heading
        ])

    # --------------------------------
    # Prediction
    # --------------------------------
    def predict(
        self,
        speed,
        gyro_z
    ):

        sigma = self.sigma_points()

        predicted_sigma = np.zeros_like(
            sigma
        )

        for i in range(len(sigma)):

            predicted_sigma[i] = (
                self.motion_model(
                    sigma[i],
                    speed,
                    gyro_z
                )
            )

        # -----------------------------
        # Predicted state
        # -----------------------------

        x_pred = np.zeros(
            self.n
        )

        # Position + speed
        for i in range(len(predicted_sigma)):

            x_pred[:3] += (
                self.Wm[i]
                * predicted_sigma[i, :3]
            )

        # Heading circular mean
        sin_sum = 0.0
        cos_sum = 0.0

        for i in range(len(predicted_sigma)):

            angle = predicted_sigma[i, 3]

            sin_sum += (
                self.Wm[i]
                * np.sin(angle)
            )

            cos_sum += (
                self.Wm[i]
                * np.cos(angle)
            )

        x_pred[3] = np.arctan2(
            sin_sum,
            cos_sum
        )

        # -----------------------------
        # Predicted covariance
        # -----------------------------

        P_pred = np.zeros(
            (self.n, self.n)
        )

        for i in range(len(predicted_sigma)):

            diff = (
                predicted_sigma[i]
                - x_pred
            )

            diff[3] = self.normalize_angle(
                diff[3]
            )

            P_pred += (
                self.Wc[i]
                * np.outer(diff, diff)
            )

        P_pred += self.Q

        self.x = x_pred

        self.P = (
            P_pred +
            P_pred.T
        ) / 2.0

        # Safety against numerical explosion
        self.P = np.clip(
            self.P,
            -1e6,
            1e6
        )

    # --------------------------------
    # GPS Update
    # --------------------------------
    def update_gps(
        self,
        gps_x,
        gps_y,
        trust=1.0
    ):

        z = np.array([
            gps_x,
            gps_y
        ])

        H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0]
        ])

        trust = np.clip(
            trust,
            0.05,
            1.0
        )

        # Low trust = higher GPS uncertainty
        R = self.R / trust

        z_pred = H @ self.x

        innovation = (
            z - z_pred
        )

        S = (
            H
            @ self.P
            @ H.T
            + R
        )

        K = (
            self.P
            @ H.T
            @ np.linalg.inv(S)
        )

        self.x = (
            self.x
            + K @ innovation
        )

        I = np.eye(self.n)

        self.P = (
            (I - K @ H)
            @ self.P
            @ (I - K @ H).T
            + K @ R @ K.T
        )

        self.P = (
            self.P +
            self.P.T
        ) / 2.0

        # Normalize heading
        self.x[3] = self.normalize_angle(
            self.x[3]
        )

        return self.x

    # --------------------------------
    # Get state
    # --------------------------------
    def get_state(self):

        return self.x.copy()