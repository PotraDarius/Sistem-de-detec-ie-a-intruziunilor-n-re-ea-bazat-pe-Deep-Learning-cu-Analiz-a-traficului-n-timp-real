"""
backend_inference.py — 1D-CNN inference engine
============================================================
Calibrare prin threshold pe confidența softmax:
predicțiile de atac cu confidență sub CONFIDENCE_THRESHOLD sunt
reetichetate "Suspicious", semnalând că modelul nu e sigur de
sub-clasă (cazul tipic al traficului out-of-distribution).

"""

import os
import joblib
import numpy as np
import torch
import torch.nn as nn


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD = 70.0


# ─────────────────────────────────────────────────────────────────────────────
# 1. ARHITECTURA MODELULUI
# ─────────────────────────────────────────────────────────────────────────────
class NIDS_1D_CNN(nn.Module):
    def __init__(self, num_features, num_classes):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels=1, out_channels=64, kernel_size=3, padding=1)
        self.bn1   = nn.BatchNorm1d(64)
        self.conv2 = nn.Conv1d(in_channels=64, out_channels=128, kernel_size=3, padding=1)
        self.bn2   = nn.BatchNorm1d(128)
        self.dropout = nn.Dropout(p=0.3)
        self.relu    = nn.ReLU()
        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(128 * num_features, 64)
        self.fc2 = nn.Linear(64, num_classes)

    def forward(self, x):
        x = x.unsqueeze(1)
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.dropout(x)
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.dropout(x)
        x = self.flatten(x)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        return self.fc2(x)


# ─────────────────────────────────────────────────────────────────────────────
# 2. ÎNCĂRCARE ARTEFACTE
# ─────────────────────────────────────────────────────────────────────────────
print("⚙️  Pornire Backend NIDS...", flush=True)

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH   = os.path.join(BASE_DIR, "model_nids_1dcnn_best.pth")
SCALER_PATH  = os.path.join(BASE_DIR, "scaler.pkl")
ENCODER_PATH = os.path.join(BASE_DIR, "label_encoder.pkl")

NUM_FEATURES = 14
device = torch.device("cpu")

scaler = joblib.load(SCALER_PATH)
le     = joblib.load(ENCODER_PATH)
num_classes = len(le.classes_)
print(f"📊 Clase detectabile ({num_classes}): {list(le.classes_)}", flush=True)

model = NIDS_1D_CNN(NUM_FEATURES, num_classes).to(device)
model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model.eval()



# ─────────────────────────────────────────────────────────────────────────────
# 3. PREDICȚIE CU CALIBRARE
# ─────────────────────────────────────────────────────────────────────────────
def predict_packet(features_list):
    """
    features_list: listă cu 14 valori numerice.
    Returnează: (clasă: str, confidență: float în 0–100).

    Logică de calibrare:
      - Dacă predicția e 'Normal'    → o întoarcem direct (nu marchează nimic suspect).
      - Dacă confidența >= threshold → întoarcem clasa de atac specifică.
      - Dacă confidența < threshold  → întoarcem 'Suspicious' (out-of-distribution).
    """
    features_array  = np.array(features_list, dtype=np.float32).reshape(1, -1)
    features_scaled = scaler.transform(features_array)
    features_tensor = torch.FloatTensor(features_scaled).to(device)

    with torch.no_grad():
        output        = model(features_tensor)
        probabilities = torch.nn.functional.softmax(output, dim=1)
        max_prob, predicted_idx = torch.max(probabilities, 1)

        confidence      = max_prob.item() * 100
        predicted_class = le.inverse_transform([predicted_idx.item()])[0]

    if predicted_class != "Normal" and confidence < CONFIDENCE_THRESHOLD:
        predicted_class = "Suspicious"

    return predicted_class, confidence


# ─────────────────────────────────────────────────────────────────────────────
# 4. TEST STANDALONE
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n--- TEST: pachet dummy ---")
    dummy = [80, 150.5, 0, 500, 45.2, 32, 1, 15000, 200, 5000, 12.5, 1, 0, 0]
    rezultat, prob = predict_packet(dummy)
    print(f"📡 Pachet : {dummy}")
    print(f"🔍 Rezultat: {rezultat} (confidență: {prob:.2f}%)")