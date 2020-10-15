import RPi.GPIO as GPIO
import time

motor_in1 = 6
motor_in2 = 7

GPIO.setmode(GPIO.BCM)
GPIO.setup(motor_in1, GPIO.OUT)
GPIO.setup(motor_in2, GPIO.OUT)


pwm1 = GPIO.PWM(motor_in1, 50)
#pwm2 = GPIO.PWM(motor_in2, 50)
pwm1.start(0)
#pwm2.start(0)
'''
try:
    for i in range(0, 10):
        GPIO.output(motor_in1, GPIO.LOW)
        for dc in range(0, 101,5):
            pwm2.ChangeDutyCycle(dc)
            time.sleep()
        time.sleep(1)
        for dc in range(100, -1,-5):
            pwm2.ChangeDutyCycle(dc)
            time.sleep(0.1)

        GPIO.output(motor_in2, GPIO.LOW)
        for dc in range(0, 101,5):
            pwm1.ChangeDutyCycle(dc)
            time.sleep(0.1)
        time.sleep(1)
        for dc in range(100, -1,-5):
            pwm1.ChangeDutyCycle(dc)
            time.sleep(0.1)

except KeyboardInterrupt:
	pass
'''

def setSpeed(speed, pwm):
    pwm.ChangeDutyCycle(speed*10)

GPIO.output(motor_in1, GPIO.LOW)
    
while True:
        setSpeed(1, pwm1)
        time.sleep(10)
    

pwm1.stop()
#pwm2.stop()
GPIO.cleanup()
'''
P_MOTA1 = 6
P_MOTA2 = 7

def forward():
    GPIO.output(P_MOTA1, GPIO.HIGH)
    GPIO.output(P_MOTA2, GPIO.LOW)

def backward():        
    GPIO.output(P_MOTA1, GPIO.LOW)
    GPIO.output(P_MOTA2, GPIO.HIGH)
    
def stop():
    GPIO.output(P_MOTA1, GPIO.LOW)
    GPIO.output(P_MOTA2, GPIO.LOW)

def setup():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(P_MOTA1, GPIO.OUT)
    GPIO.setup(P_MOTA2, GPIO.OUT)
    
print ("starting")
setup()
while True:
    print ("forward")
    forward()
    time.sleep(2)
    print ("backward")
    backward()
    time.sleep(2)
    print ("stop")
    stop()
    time.sleep(2)
'''

