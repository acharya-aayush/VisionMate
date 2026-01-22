import cv2
import numpy as np
import os
from tqdm import tqdm  # For progress tracking

# Initialize face detector with optimized parameters
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Configure LBPH recognizer with tuned parameters
recognizer = cv2.face.LBPHFaceRecognizer_create(
    radius=2,          # Increased from default 1
    neighbors=16,      # Increased from default 8
    grid_x=8,          # Increased from default 7
    grid_y=8,          # Increased from default 7
    threshold=85       # Set confidence threshold
)

def preprocess_face(image):
    """Enhance image quality and standardize face size"""
    # Resize to consistent dimensions
    resized = cv2.resize(image, (256, 256))
    
    # Apply histogram equalization
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    equalized = clahe.apply(resized)
    
    # Apply Gaussian blur for noise reduction
    blurred = cv2.GaussianBlur(equalized, (5, 5), 0)
    
    return blurred

def validate_dataset():
    """Check dataset integrity before training"""
    valid_users = {}
    dataset_path = "dataset"

    print("\n🔍 Validating dataset structure...")

    if not os.path.exists(dataset_path):
        print("❌ Dataset folder is missing!")
        return {}

    for root, dirs, files in os.walk(dataset_path):
        base_dir = os.path.basename(root)

        # Allow both 'user1' and 'user_1' formats
        if not base_dir.startswith("user"):
            print(f"⚠️ Skipping invalid folder: {base_dir}")
            continue

        try:
            # Extract user ID (handles both 'user1' and 'user_1' cases)
            user_id = int(''.join(filter(str.isdigit, base_dir)))  # Extract only numbers from folder name
            image_count = len([f for f in files if f.endswith(".jpg")])
            valid_users[user_id] = image_count
        except ValueError:
            print(f"⚠️ Invalid folder name: {base_dir}")
            continue

    print("\n📊 Dataset Summary:")
    if not valid_users:
        print("❌ No valid users found!")
    else:
        for user_id, count in valid_users.items():
            print(f"✅ User {user_id}: {count} samples")

    return valid_users

def train_model():
    faces = []
    labels = []
    
    # Dataset validation
    user_stats = validate_dataset()
    if not user_stats:
        print("❌ No valid users found in dataset!")
        return

    print("\n🚀 Starting training process...")
    
    # Process images with progress bar
    for user_id, sample_count in user_stats.items():
        user_path = os.path.join("dataset", f"user{user_id}")  # Works for 'user1', 'user2', etc.
        print(f"\nProcessing User {user_id} ({sample_count} samples)...")
        
        for file in tqdm(os.listdir(user_path), desc=f"User {user_id}"):
            if not file.endswith(".jpg"):
                continue
                
            img_path = os.path.join(user_path, file)
            img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
            
            if img is None:
                print(f"⚠️ Corrupted image: {file}")
                continue
                
            # Secondary face detection to ensure quality
            faces_rect = face_cascade.detectMultiScale(
                img,
                scaleFactor=1.05,
                minNeighbors=6,
                minSize=(100, 100)
            )

            if len(faces_rect) != 1:
                print(f"⚠️ Invalid face in: {file}")
                continue
                
            # Preprocessing pipeline
            processed_face = preprocess_face(img)
            faces.append(processed_face)
            labels.append(user_id)

    if len(faces) < 100:
        print("❌ Insufficient training data (min 100 samples required)")
        return

    # Shuffle dataset to prevent order bias
    shuffle_idx = np.random.permutation(len(faces))
    faces = [faces[i] for i in shuffle_idx]
    labels = [labels[i] for i in shuffle_idx]

    print(f"\n📦 Final training set: {len(faces)} samples")
    
    # Train with validation checks
    try:
        recognizer.train(faces, np.array(labels))
        recognizer.save("trainer.yml")
        print("\n✅ Training successful! Model saved as 'trainer.yml'")
        
        # Save label mapping
        with open("label_mapping.txt", "w") as f:
            for user_id in user_stats:
                f.write(f"{user_id}\n")
        print("💾 Label mapping saved to 'label_mapping.txt'")
        
    except Exception as e:
        print(f"❌ Training failed: {str(e)}")

if __name__ == "__main__":
    train_model()
