#!/bin/sh

sudo chmod 777 /home/pi/nCube-airquality
cd /home/pi/nCube-airquality
sudo chmod 777 *
python3 get_data.py
sleep 2
pm2 start thyme.js
