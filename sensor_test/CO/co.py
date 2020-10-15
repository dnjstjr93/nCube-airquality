import ze07

print ("Start CO sensor measurement")
# Set HWSS ZE07-CO sensor
co = ze07.Ze07UartReader()
print ("Set ZE07-CO")

while True:
	co_val = co.read()
	print (co_val)
