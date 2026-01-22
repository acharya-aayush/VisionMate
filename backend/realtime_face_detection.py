import cv2
import time
from pygame import mixer

# Configuration
MOBILE_CAM_URL = "http://192.168.137.190:8080/video"  # Use 0 for webcam
MIN_CONFIDENCE = 85

def initialize_system():
    """Initialize all components with error handling"""
    # Initialize mixer first
    try:
        mixer.init()
        print("✅ Audio system initialized")
    except:
        print("❌ Failed to initialize audio")

    # Load face recognition model
    face_recognizer = cv2.face.LBPHFaceRecognizer_create()
    try:
        face_recognizer.read("trained_model.yml")
        print("✅ Face model loaded")
    except:
        print("❌ Failed to load face model")
        return None

    # Initialize camera
    camera = cv2.VideoCapture(MOBILE_CAM_URL)
    if not camera.isOpened():
        print("❌ Camera connection failed")
        print("Trying webcam as fallback...")
        camera = cv2.VideoCapture(0)
        
    if not camera.isOpened():
        print("❌ No camera available")
        return None
    
    print("✅ Camera connected")
    return face_recognizer, camera

def main():
    system = initialize_system()
    if not system:
        return
        
    recognizer, camera = system
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    )

    last_announce = {}
    
    while True:
        success, frame = camera.read()
        if not success:
            print("⚠️ Frame error - retrying...")
            time.sleep(1)
            continue
            
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 5)
        
        for (x, y, w, h) in faces:
            face_roi = gray[y:y+h, x:x+w]
            
            try:
                label, confidence = recognizer.predict(face_roi)
                user_id = label if confidence < MIN_CONFIDENCE else "Unknown"
            except:
                user_id = "Error"
                
            # Draw rectangle
            color = (0, 255, 0) if user_id not in ("Unknown", "Error") else (0, 0, 255)
            cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
            
            # Display text
            text = f"{user_id} ({confidence:.1f}%)" if isinstance(user_id, int) else user_id
            cv2.putText(frame, text, (x, y-10), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            
            # Sound logic
            if isinstance(user_id, int):
                if time.time() - last_announce.get(user_id, 0) > 5:
                    try:
                        mixer.music.load(f"sounds/user{user_id}.mp3")
                        mixer.music.play()
                        last_announce[user_id] = time.time()
                    except:
                        pass

        cv2.imshow('Live Recognition', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    camera.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    print("🚀 Starting Facial Recognition System...")
    main()
    print("🛑 System shutdown")