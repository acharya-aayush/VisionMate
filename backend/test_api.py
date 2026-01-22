
import requests
import base64
import cv2
import numpy as np
import simple_recognizer

def test_recognition():
    print("🚀 Testing Face Recognition API...")
    url = "http://localhost:8000/recognize-base64"
    
    # Create a dummy image (black square)
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    # Draw a face-like circle
    cv2.circle(img, (150, 150), 50, (255, 255, 255), -1)
    
    # Enroll it properly
    _, buffer = cv2.imencode('.jpg', img)
    b64_str = base64.b64encode(buffer).decode('utf-8')
    base64_img = f"data:image/jpeg;base64,{b64_str}"
    
    payload = {"image": base64_img}
    
    try:
        print(f"   Sending POST request to {url}...")
        response = requests.post(url, json=payload)
        
        print(f"   Status Code: {response.status_code}")
        print(f"   Response: {response.text}")
        
        if response.status_code == 200:
            print("✅ API Success!")
        else:
            print("❌ API Failed")
            
    except Exception as e:
        print(f"❌ Request failed: {e}")

if __name__ == "__main__":
    test_recognition()
