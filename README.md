# nCube-airquality
## Initial Configuration
 1. Set I2C Port
    ```
    $ sudo nano /boot/config.txt
    
    # Add i2c port & bus at last line
    dtoverlay=i2c-gpio,i2c_gpio_sda=6,i2c_gpio_scl=7
    ```

 2. Install requirements

    - MQTT-broker
        ```
        $ wget http://repo.mosquitto.org/debian/mosquitto-repo.gpg.key
        $ sudo apt-key add mosquitto-repo.gpg.key
        $ cd /etc/apt/sources.list.d/
        $ sudo wget http://repo.mosquitto.org/debian/mosquitto-buster.list 
        $ sudo apt-get update
        $ sudo apt-get install mosquitto
        ```
    - Python Library
       - mqtt
        ```
        $ pip3 install paho-mqtt
        ```

 3. Install dependencies
    ```
    $ curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
    
    $ sudo apt-get install -y nodejs
    
    $ node -v
    
    $ sudo npm install -g pm2
    
    $ git clone https://github.com/IoTKETI/nCube-airquality
    
    $ cd /home/pi/nCube-airquality
    
    $ npm install
    ```


# 1. Each Sensor Test
 * CO Sensor
   - connect Co sensor to ttyUSB5
 ```
 $ cd sensor_test
 $ python3 CO/co.py
 ```
 * Co2 Sensor
    - connect Co sensor to ttyAMA0
 ```
 $ cd sensor_test
 $ python3 co2/co2.py
 ```
 * TVOC Sensor
    - connect SDA to GPIO 6 and SCL to GPIO 7
```
 $ cd sensor_test
 $ python3 tvoc/tvoc.py
 ```
 * PM Sensor
    - connect Co sensor to ttyUSB3
```
 $ cd sensor_test
 $ python3 sensirion-sps030/test.py
 ```

## 4. Auto Start
```
$ sudo nano /etc/xdg/lxsession/LXDE-pi/autostart
```
```
# Add start command
sh /home/pi/nCube-airquality/auto-food.sh
```