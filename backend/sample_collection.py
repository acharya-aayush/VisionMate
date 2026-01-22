import cv2
import numpy as np
import os
import time
from tqdm import tqdm

# Initialize face detector
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def verify_dataset_structure():
    """Check dataset folder structure and contents"""
    print("\n🔍 Verifying dataset structure...")
    
    if not os.path.exists("dataset"):
        print("❌ Dataset folder not found!")
        return False
        
    users = [d for d in os.listdir("dataset") if os.path.isdir(os.path.join("dataset", d))]
    valid_users = []
    
    for user in users:
        user_path = os.path.join("dataset", user)
        jpg_files = [f for f in os.listdir(user_path) if f.lower().endswith(".jpg")]
        
        if len(jpg_files) > 0:
            print(f"✅ Found {len(jpg_files)} samples in {user}")
            valid_users.append(user)
        else:
            print(f"⚠️ No JPG files found in {user}")
            
    return valid_users

def train_model():
    # Verify dataset first
    valid_users = verify_dataset_structure()
    if not valid_users:
        print("❌ No valid users found for training!")
        return
        
    print("\n⚙️ Initializing face recognizer...")
    recognizer = cv2.face.LBPHFaceRecognizer_create(
        radius=1,
        neighbors=8,
        grid_x=7,
        grid_y=7,
        threshold=85
    )
    
    faces = []
    labels = []
    
    print("\n📂 Loading training samples...")
    
    # Memory-friendly loading with progress bar
    for user in tqdm(valid_users, desc="Processing Users"):
        user_path = os.path.join("dataset", user)
        user_id = int(''.join(filter(str.isdigit, user)))  # Extract numeric ID
        
        for file in os.listdir(user_path):
            if not file.lower().endswith((".jpg", ".jpeg")):
                continue
                
            file_path = os.path.join(user_path, file)
            
            try:
                img = cv2.imread(file_path, cv2.IMREAD_GRAYSCALE)
                if img is None:
                    continue
                
                # Basic face validation
                faces_rect = face_cascade.detectMultiScale(
                    img,
                    scaleFactor=1.1,
                    minNeighbors=5,
                    minSize=(100, 100)
                )
                
                if len(faces_rect) == 1:  # Only use images with exactly one face
                    resized = cv2.resize(img, (200, 200))
                    faces.append(resized)
                    labels.append(user_id)
                    
            except Exception as e:
                print(f"⚠️ Error processing {file}: {str(e)}")
                continue
                
    if len(faces) < 2:
        print("❌ Need at least 2 samples for training!")
        return
        
    print(f"\n🔥 Loaded {len(faces)} valid face samples")
    
    # Convert to numpy arrays
    faces = np.array(faces)
    labels = np.array(labels)
    
    # Train with progress monitoring
    print("\n🚀 Starting training...")
    start_time = time.time()
    
    try:
        recognizer.train(faces, labels)
        training_time = time.time() - start_time
        print(f"✅ Training completed in {training_time:.2f} seconds")
        
        recognizer.save("trained_model.yml")
        print("💾 Model saved as 'trained_model.yml'")
        
    except Exception as e:
        print(f"❌ Training failed: {str(e)}")

if __name__ == "__main__":
    train_model()