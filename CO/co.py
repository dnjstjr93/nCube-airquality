import ze07

co = ze07.Ze07UartReader()

while True:
    co_val = co.read()
    print (co_val)
