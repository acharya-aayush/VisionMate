"""
Simple Face Recognition for Vision Mate
Uses OpenCV's LBPH recognizer with Haar Cascade detection
Clean implementation - no external dependencies beyond opencv-contrib-python
"""

import os
import json
import cv2
import numpy as np
from pathlib import Path
from typing import Optional, Tuple, List, Dict
from dataclasses import dataclass
from datetime import datetime


@dataclass
class RecognitionResult:
    """Result of a face recognition attempt"""
    user_id: Optional[int]
    user_name: Optional[str]
    confidence: float
    face_location: Optional[Tuple[int, int, int, int]]  # (top, right, bottom, left)
    is_known: bool


class SimpleFaceRecognizer:
    """
    Simple face recognition using OpenCV LBPH.
    """
    
    def __init__(self, 
                 dataset_path: str = "dataset",
                 model_path: str = "face_model.yml",
                 user_mapping_path: str = "user_mapping.json",
                 confidence_threshold: float = 80.0):
        
        self.dataset_path = Path(dataset_path)
        self.model_path = Path(model_path)
        self.user_mapping_path = Path(user_mapping_path)
        self.confidence_threshold = confidence_threshold
        
        # Face detector
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        
        # Face recognizer - LBPH
        self.recognizer = cv2.face.LBPHFaceRecognizer_create(
            radius=1,
            neighbors=8,
            grid_x=8,
            grid_y=8
        )
        
        self.user_names: Dict[int, str] = {}
        self.is_trained = False
        
        self._load_user_mapping()
        self._load_model()
    
    def _load_user_mapping(self):
        """Load user ID to name mapping"""
        if self.user_mapping_path.exists():
            with open(self.user_mapping_path, 'r', encoding='utf-8') as f:
                mapping = json.load(f)
                self.user_names = {int(k): v for k, v in mapping.items()}
            print(f"✅ Loaded {len(self.user_names)} users: {self.user_names}")
    
    def _save_user_mapping(self):
        """Save user mapping"""
        with open(self.user_mapping_path, 'w', encoding='utf-8') as f:
            json.dump({str(k): v for k, v in self.user_names.items()}, f, indent=2)
    
    def _load_model(self):
        """Load trained model if exists"""
        if self.model_path.exists():
            try:
                self.recognizer.read(str(self.model_path))
                self.is_trained = True
                print(f"✅ Loaded model from {self.model_path}")
            except Exception as e:
                print(f"⚠️ Could not load model: {e}")
    
    def _to_gray(self, image: np.ndarray) -> np.ndarray:
        """Convert to grayscale if needed"""
        if len(image.shape) == 3:
            return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return image
    
    def _detect_faces(self, gray: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """Detect faces and return as (top, right, bottom, left) tuples"""
        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )
        return [(y, x + w, y + h, x) for (x, y, w, h) in faces]
    
    def train(self, max_per_user: int = 100) -> Dict[str, int]:
        """Train on dataset"""
        faces = []
        labels = []
        stats = {'processed': 0, 'failed': 0, 'users': 0}
        
        if not self.dataset_path.exists():
            print(f"❌ Dataset not found: {self.dataset_path}")
            return stats
        
        print("\n🚀 Training face recognition model...")
        
        for user_folder in sorted(self.dataset_path.iterdir()):
            if not user_folder.is_dir():
                continue
            
            # Extract user ID
            try:
                user_id = int(''.join(filter(str.isdigit, user_folder.name)))
            except ValueError:
                continue
            
            user_name = self.user_names.get(user_id, f"User{user_id}")
            images = list(user_folder.glob("*.jpg"))[:max_per_user]
            
            print(f"   📸 {user_name}: {len(images)} images")
            
            count = 0
            for img_path in images:
                try:
                    img = cv2.imread(str(img_path), cv2.IMREAD_GRAYSCALE)
                    if img is None:
                        continue
                    
                    # Resize to consistent size
                    resized = cv2.resize(img, (200, 200))
                    faces.append(resized)
                    labels.append(user_id)
                    count += 1
                    stats['processed'] += 1
                except:
                    stats['failed'] += 1
            
            if count > 0:
                stats['users'] += 1
        
        if len(faces) < 2:
            print("❌ Need at least 2 face samples")
            return stats
        
        # Train
        self.recognizer.train(faces, np.array(labels))
        self.recognizer.save(str(self.model_path))
        self.is_trained = True
        
        print(f"\n✅ Training done! {stats['processed']} faces, {stats['users']} users")
        return stats
    
    def recognize(self, image: np.ndarray) -> List[RecognitionResult]:
        """Recognize faces in image"""
        results = []
        
        if not self.is_trained:
            return results
        
        gray = self._to_gray(image)
        face_locs = self._detect_faces(gray)
        
        for (top, right, bottom, left) in face_locs:
            face = gray[top:bottom, left:right]
            if face.size == 0:
                continue
            
            face = cv2.resize(face, (200, 200))
            
            try:
                user_id, confidence = self.recognizer.predict(face)
                
                # Lower confidence = better match
                if confidence <= self.confidence_threshold:
                    results.append(RecognitionResult(
                        user_id=user_id,
                        user_name=self.user_names.get(user_id, f"User{user_id}"),
                        confidence=max(0, 100 - confidence),
                        face_location=(top, right, bottom, left),
                        is_known=True
                    ))
                else:
                    results.append(RecognitionResult(
                        user_id=None,
                        user_name="Unknown",
                        confidence=max(0, 100 - confidence),
                        face_location=(top, right, bottom, left),
                        is_known=False
                    ))
            except:
                results.append(RecognitionResult(
                    user_id=None,
                    user_name="Error",
                    confidence=0,
                    face_location=(top, right, bottom, left),
                    is_known=False
                ))
        
        return results
    
    def add_face(self, image: np.ndarray, user_id: int, user_name: str) -> bool:
        """Add new face and retrain"""
        gray = self._to_gray(image)
        faces = self._detect_faces(gray)
        
        if not faces:
            return False
        
        top, right, bottom, left = faces[0]
        face = gray[top:bottom, left:right]
        
        # Save to dataset
        user_folder = self.dataset_path / f"user{user_id}"
        user_folder.mkdir(exist_ok=True)
        
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        cv2.imwrite(str(user_folder / f"{user_name}_{ts}.jpg"), face)
        
        # Update mapping
        self.user_names[user_id] = user_name
        self._save_user_mapping()
        
        # Retrain
        self.train()
        return True
    
    def get_next_user_id(self) -> int:
        if not self.user_names:
            return 1
        return max(self.user_names.keys()) + 1
    
    def list_users(self) -> Dict[int, str]:
        return self.user_names.copy()


if __name__ == "__main__":
    print("🧪 Testing SimpleFaceRecognizer...")
    rec = SimpleFaceRecognizer()
    
    if not rec.is_trained:
        rec.train()
    
    print(f"Users: {rec.list_users()}")
