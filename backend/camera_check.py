import cv2

cap = cv2.VideoCapture("http://192.168.137.190:8080/video")
if not cap.isOpened():
    print("❌ Camera connection failed!")
else:
    print("✅ Camera connected!")
    while True:
        ret, frame = cap.read()
        if ret:
            cv2.imshow('Test Feed', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    cap.release()
    cv2.destroyAllWindows()