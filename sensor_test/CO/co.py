import ze07

# Set HWSS ZE07-CO sensor
co = ze07.Ze07UartReader()

while True:
	co_val = co.read()
	print (co_val)
