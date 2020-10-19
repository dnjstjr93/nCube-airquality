import sys, os, json
import time, board, busio
import paho.mqtt.client as mqtt
from lib import ze07
from lib import co2
import adafruit_ccs811
from lib import sensirion_sps030
from argparse import ArgumentParser
import logging
import RPi.GPIO as GPIO

# Set HWSS ZE07-CO sensor
co = ze07.Ze07UartReader()
# Set DS-CO2-20 sensor
sCO2 = co2.SensorCO2()
# Adafruit CCS811 TOVC sensor
i2c = busio.I2C(board.SCL, board.SDA)
ccs811 = adafruit_ccs811.CCS811(i2c)
# Set Sensirion AG SPS30 sensor
ARG_PARSER = ArgumentParser(
    description="Return one reading from the SPS030 sensor attached to the speficied serial port")
LOGGING_OUTPUT = ARG_PARSER.add_mutually_exclusive_group()
LOGGING_OUTPUT.add_argument(
    "-q",
    "--quiet",
    action="store_true",
    help="Suppress most ouput")
LOGGING_OUTPUT.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Maximum verbosity output on command line")
#     ARG_PARSER.add_argument(
#        "sensor_port",
#         action="store",
#         help="Port to which the sensor is connected")
ARGS = ARG_PARSER.parse_args()
CONSOLE_LOG_LEVEL = logging.INFO
if ARGS.quiet:
    CONSOLE_LOG_LEVEL = logging.ERROR
elif ARGS.verbose:
    CONSOLE_LOG_LEVEL = logging.DEBUG
# Set DC motor
motor_in1 = 6
motor_in2 = 7

GPIO.setmode(GPIO.BCM)
GPIO.setup(motor_in1, GPIO.OUT)
GPIO.setup(motor_in2, GPIO.OUT)


g_res_event = 0x00

RES_CO = 0x01
RES_CO2 = 0x02
RES_TVOC = 0x04
RES_PM = 0x08
RES_PM = 0x08
SET_DCMOTOR = 0x10

g_res_co = {}
g_res_co2 = {}
g_res_tvoc = {}
g_res_pm = {}
g_set_dcmotor_val = {}


#---Get PM Data---------------------------------------------------------
def PM(console_log_level):
    RX_DELAY_S = 0.02 

    SPS030 = sensirion_sps030.Sensirion(
    	port='/dev/ttyUSB3', log_level=console_log_level)

    time.sleep(RX_DELAY_S)
    mess=SPS030.read_measurement()

    #SPS030.logger.info("reading: %s",mess)
    result = str(mess).split(", ")
    
    return result

#---Set DC motor control-----------------------------------------------
def dc_motor(command):
    if command == 1:
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
        
        for i in range(10):
            setSpeed(1, pwm1)
    

        #pwm1.stop()
        #pwm2.stop()
        #GPIO.cleanup()
    else:
        pwm1.stop()
        #pwm2.stop()
        GPIO.cleanup()
        #pass

#---Parse Data----------------------------------------------------------
def json_to_val(json_val):
    payloadData = json.loads(json_val)
    val = payloadData['val']
    return (val)


def val_to_json(val):
    if (not(isinstance(val, list))):
        json_val = {"val":val}
        json_val = json.dumps(json_val)
    else:
        json_val = {"val":val[1],"val2":val[2],"val3":val[3],"val4":val[4],"val5":val[5],"val6":val[6],"val7":val[7],"val8":val[8],"val9":val[9],"val10":val[10]}
        json_val = json.dumps(json_val)

    return (json_val)
#-----------------------------------------------------------------------

#---MQTT----------------------------------------------------------------
def on_connect(client,userdata,flags, rc):
    print('[dry_mqtt_connect] connect to ', broker_ip)
    air_client.subscribe("/req_co")
    air_client.subscribe("/req_co2")
    air_client.subscribe("/req_tvoc")
    air_client.subscribe("/req_pm")
    air_client.subscribe("/set_dcmotor")


def on_disconnect(client, userdata, flags, rc=0):
    print(str(rc))


def on_subscribe(client, userdata, mid, granted_qos):
    print("subscribed: " + str(mid) + " " + str(granted_qos))


def on_message(client, userdata, _msg):
    global g_res_event
    global g_res_co
    global g_res_co2
    global g_set_dcmotor_val

    if _msg.topic == '/req_co':
        g_res_event |= RES_CO
    elif _msg.topic == '/req_co2':
        g_res_event |= RES_CO2
    elif _msg.topic == '/req_tvoc':
        g_res_event |= RES_TVOC
    elif _msg.topic == '/req_pm':
        g_res_event |= RES_PM
    elif _msg.topic == '/set_dcmotor':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        g_set_dcmotor_val = json_to_val(data)
        g_res_event |= SET_DCMOTOR            

#-----------------------------------------------------------------------

if __name__ == "__main__":
    broker_ip = "localhost"
    port = 1883

    air_client = mqtt.Client()
    air_client.on_connect = on_connect
    air_client.on_disconnect = on_disconnect
    air_client.on_subscribe = on_subscribe
    air_client.on_message = on_message
    air_client.connect(broker_ip, port)

    air_client.loop_start()

    while True:
        if g_res_event & RES_CO:
            g_res_event &= (~RES_CO)
            co_val = co.read()
            co_dict = val_to_json(co_val)
            print ('co_dict: ', co_dict)
            air_client.publish("/res_co", co_dict)
        elif g_res_event & RES_CO2:
            g_res_event &= (~RES_CO2)
            co2_val = sCO2.continueRead()
            co2_dict = val_to_json(co2_val)
            print ('co2_dict: ', co2_dict)
            air_client.publish("/res_co2", co2_dict)
        elif g_res_event & RES_TVOC:
            g_res_event &= (~RES_TVOC)
            tvoc_val = ccs811.tvoc
            tvoc_dict = val_to_json(tvoc_val)
            print ('tvoc_dict: ', tvoc_dict)
            air_client.publish("/res_tvoc", tvoc_dict)
        elif g_res_event & RES_PM:
            g_res_event &= (~RES_PM)
            pm_val = PM(CONSOLE_LOG_LEVEL)
            pm_dict = val_to_json(pm_val)
            print ('pm_dict: ', pm_dict)
            air_client.publish("/res_pm", pm_dict)
        elif g_res_event & SET_DCMOTOR:
            g_res_event &= (~SET_DCMOTOR)
            # dc_motor(g_set_dcmotor_val)
