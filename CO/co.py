import sys, os, json
import paho.mqtt.client as mqtt
import ze07

# Set HWSS ZE07-CO sensor
co = ze07.Ze07UartReader()

co = dict()

#---Parse Data----------------------------------------------------------
def json_to_val(json_val):
	payloadData = json.loads(json_val)

	if (len(payloadData) == 1):
		val = payloadData['val']
		return (val)
	elif (len(payloadData) == 2):
		val = payloadData['val']
		val2 = payloadData['val2']
		return (val, val2)
	elif (len(payloadData) == 3):
		val = payloadData['val']
		val2 = payloadData['val2']
		val3 = payloadData['val3']
		return (val, val2, val3)

def val_to_json(val,val2=None):
	if (val2 != None):
		json_val = {"val":val,"val2":val2}
	else:
		json_val = {"val":val}
	json_val = json.dumps(json_val)

	return (json_val)
#-----------------------------------------------------------------------

#---MQTT----------------------------------------------------------------
def on_connect(client,userdata,flags, rc):
	print('[dry_mqtt_connect] connect to ', broker_ip)
	air_client.subscribe("/co")


def on_disconnect(client, userdata, flags, rc=0):
	print(str(rc))


def on_subscribe(client, userdata, mid, granted_qos):
	print("subscribed: " + str(mid) + " " + str(granted_qos))


def on_message(client, userdata, _msg):
    global co

    co_val = co.read()
    co_dict = val_to_json(co_val)
    print (co_dict)
    air_client.publish("/co", co_dict)
    
#-----------------------------------------------------------------------
if __name__ == "__main__":
    
    global air_client

    broker_ip = "localhost"
    port = 1883

    air_client = mqtt.Client()
    air_client.on_connect = on_connect
    air_client.on_disconnect = on_disconnect
    air_client.on_subscribe = on_subscribe
    air_client.on_message = on_message
    air_client.connect(broker_ip, port)

    air_client.loop_forever()
