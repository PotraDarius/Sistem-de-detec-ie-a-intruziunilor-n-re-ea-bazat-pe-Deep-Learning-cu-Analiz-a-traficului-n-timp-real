"""
prepare_artifacts.py — pregătire one-time
=========================================
Generează scaler.pkl și label_encoder.pkl pe care backend_inference.py
le va încărca direct în Docker.
"""

import os
import joblib
import pandas as pd
from sklearn.preprocessing import StandardScaler, LabelEncoder

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Dataset_Optimizat_Complet.csv")


OUTPUT_DIR = "."
# ──────────────────────────────────────────────────────────────────────────────

print(f"📂 Încărcare dataset: {CSV_PATH}")
df = pd.read_csv(CSV_PATH)
print(f"   {len(df)} rânduri, {len(df.columns)} coloane")

X = df.drop("Label", axis=1).values
y = df["Label"].values

print("⚙️  Fitting LabelEncoder...")
le = LabelEncoder()
le.fit(y)
print(f"   Clase ({len(le.classes_)}): {list(le.classes_)}")

print("⚙️  Fitting StandardScaler...")
scaler = StandardScaler()
scaler.fit(X)
print(f"   Caracteristici: {X.shape[1]}")

encoder_path = os.path.join(OUTPUT_DIR, "label_encoder.pkl")
scaler_path  = os.path.join(OUTPUT_DIR, "scaler.pkl")

joblib.dump(le, encoder_path)
joblib.dump(scaler, scaler_path)

print()
print(f"✅ Salvat: {encoder_path}")
print(f"✅ Salvat: {scaler_path}")
print()
