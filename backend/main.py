import cv2
import os
import time
import shutil

# Ensure the script is running in the expected directory
print(f"Current Working Directory: {os.getcwd()}")

# Delete old dataset before starting
dataset_path = os.path.join(os.getcwd(), "dataset")

if os.path.exists(dataset_path):
    shutil.rmtree(dataset_path)  # Delete dataset folder if it exists
os.makedirs(dataset_path, exist_ok=True)  # Create dataset folder

print("Old dataset cleared. Starting fresh...")

# Initialize face detector (Haar Cascade)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def get_mobile_camera_feed(url):
    """Open a stream from the mobile camera feed URL."""
    cap = cv2.VideoCapture(url)
    if not cap.isOpened():
        print("❌ Error: Could not access mobile camera feed.")
        return None
    return cap

def collect_samples(user_name, duration=180, num_samples=500):
    """Collect face samples from the mobile camera feed."""
    user_folder = os.path.join(dataset_path, user_name)
    os.makedirs(user_folder, exist_ok=True)  # Ensure user-specific folder exists

    # URL of the mobile camera feed
    mobile_camera_url = "https://192.168.137.190:8080/video"  # Replace with your mobile camera feed URL

    cap = get_mobile_camera_feed(mobile_camera_url)
    if cap is None:
        return

    count = 0
    start_time = time.time()

    while count < num_samples and (time.time() - start_time) < duration:
        ret, frame = cap.read()
        if not ret:
            print("❌ Error: Failed to capture an image.")
            continue

        # Convert frame to grayscale for face detection
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Detect faces
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

        if len(faces) == 0:
            continue  # Skip frame if no face is detected

        print(f"Detected {len(faces)} face(s)")

        # Save faces as images
        for (x, y, w, h) in faces:
            face_roi = gray[y:y + h, x:x + w]
            filename = f"{user_name}_{count}.jpg"
            file_path = os.path.join(user_folder, filename)

            # Save the face sample
            cv2.imwrite(file_path, face_roi)
            if os.path.exists(file_path):  # Verify if file was created
                print(f"✅ Saved: {file_path}")
            else:
                print(f"❌ Failed to save: {file_path}")

            count += 1
            if count >= num_samples:
                break  # Stop once we reach the required number

            # Draw rectangle around the face
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            cv2.putText(frame, f"{user_name}: {count}/{num_samples}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        # Display the frame
        cv2.imshow('Collecting Samples', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print(f"{user_name}: Successfully captured {count} samples!\n")


# **Collect samples for 4 users**
for i in range(4):
    user_name = input(f"Enter name of user {i+1} (e.g., Aaryan): ")
    print(f"\n📸 Starting sample collection for {user_name}...\n")
    collect_samples(user_name=user_name, duration=180, num_samples=500)

    if i < 3:
        proceed = input("\nPress Enter to continue to the next user or 'q' to quit: ")
        if proceed.lower() == 'q':
            break

# Verify dataset folder
print(f"\n🔎 Checking if dataset exists at: {dataset_path}")
if os.path.exists(dataset_path) and os.listdir(dataset_path):
    print(f"✅ Dataset successfully created at {dataset_path}")
else:
    print(f"❌ Dataset folder is missing!")
