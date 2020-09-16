/**
 * Copyright (c) 2018, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * Created by ryeubi on 2015-08-31.
 */

var http = require('http');
var express = require('express');
var fs = require('fs');
var mqtt = require('mqtt');
var util = require('util');
var url = require('url');
var ip = require('ip');
var shortid = require('shortid');
var moment = require('moment');
var spawn = require('child_process').spawn;

global.sh_adn = require('./http_adn');
var noti = require('./noti');

var HTTP_SUBSCRIPTION_ENABLE = 0;
var MQTT_SUBSCRIPTION_ENABLE = 0;

global.my_data_name = '';
global.dry_loadcell = '';
global.my_parent_cnt_name = '';
global.my_cnt_name = '';
global.pre_my_cnt_name = '';
global.my_mission_parent = '';
global.my_mission_name = '';
global.zero_parent_mission_name = '';
global.zero_mission_name = '';
global.my_sortie_name = 'disarm';
global.my_secure = 'off';

const first_interval = 3000;
const retry_interval = 2500;
const normal_interval = 100;
var data_interval = 10000;
const display_interval = 1000;

const always_interval = 30000;
const always_period_tick = parseInt((3 * 60 * 1000) / always_interval);

const TURN_ON = 0;
const TURN_OFF = 1;
const TURN_BACK = -1;

var app = express();

var dryer_event = 0x00;

const EVENT_INPUT_DOOR_OPEN = 0x01;
const EVENT_INPUT_DOOR_CLOSE = 0x02;
const EVENT_OUTPUT_DOOR_OPEN = 0x04;
const EVENT_OUTPUT_DOOR_CLOSE = 0x08;
const EVENT_SAFE_DOOR_OPEN = 0x10;
const EVENT_SAFE_DOOR_CLOSE = 0x20;
const EVENT_START_BUTTON = 0x40;
const EVENT_START_BTN_LONG = 0x80;

var dryer_event_2 = 0x00;

const EVENT_HEAT_COMPLETE = 0x01;
const EVENT_EXHAUST_COMPLETE = 0x04;
const EVENT_END_ACTION = 0x08;
const EVENT_DEBUG_BUTTON_RELEASE = 0x10;
const EVENT_DEBUG_BUTTON_PRESS = 0x20;


// ?????? ????????.
var server = null;
var noti_topic = '';

// ready for mqtt
for(var i = 0; i < conf.sub.length; i++) {
    if(conf.sub[i].name != null) {
        if(url.parse(conf.sub[i].nu).protocol === 'http:') {
            HTTP_SUBSCRIPTION_ENABLE = 1;
            if(url.parse(conf.sub[i]['nu']).hostname === 'autoset') {
                conf.sub[i]['nu'] = 'http://' + ip.address() + ':' + conf.ae.port + url.parse(conf.sub[i]['nu']).pathname;
            }
        }
        else if(url.parse(conf.sub[i].nu).protocol === 'mqtt:') {
            MQTT_SUBSCRIPTION_ENABLE = 1;
        }
        else {
            //console.log('notification uri of subscription is not supported');
            //process.exit();
        }
    }
}

var return_count = 0;
var request_count = 0;

function ready_for_notification() {
    if(HTTP_SUBSCRIPTION_ENABLE == 1) {
        server = http.createServer(app);
        server.listen(conf.ae.port, function () {
            console.log('http_server running at ' + conf.ae.port + ' port');
        });
    }

    if(MQTT_SUBSCRIPTION_ENABLE == 1) {
        for(var i = 0; i < conf.sub.length; i++) {
            if (conf.sub[i].name != null) {
                if (url.parse(conf.sub[i].nu).protocol === 'mqtt:') {
                    if (url.parse(conf.sub[i]['nu']).hostname === 'autoset') {
                        conf.sub[i]['nu'] = 'mqtt://' + conf.cse.host + '/' + conf.ae.id;
                        noti_topic = util.format('/oneM2M/req/+/%s/#', conf.ae.id);
                    }
                    else if (url.parse(conf.sub[i]['nu']).hostname === conf.cse.host) {
                        noti_topic = util.format('/oneM2M/req/+/%s/#', conf.ae.id);
                    }
                    else {
                        noti_topic = util.format('%s', url.parse(conf.sub[i].nu).pathname);
                    }
                }
            }
        }
        //mqtt_connect(conf.cse.host, noti_topic);
    }
}

function ae_response_action(status, res_body, callback) {
    var aeid = res_body['m2m:ae']['aei'];
    conf.ae.id = aeid;
    callback(status, aeid);
}

function create_cnt_all(count, callback) {
    if(conf.cnt.length == 0) {
        callback(2001, count);
    }
    else {
        if(conf.cnt.hasOwnProperty(count)) {
            var parent = conf.cnt[count].parent;
            var rn = conf.cnt[count].name;
            sh_adn.crtct(parent, rn, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_cnt_all(++count, function (status, count) {
                        callback(status, count);
                    });
                }
                else {
                    callback(9999, count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

function delete_sub_all(count, callback) {
    if(conf.sub.length == 0) {
        callback(2001, count);
    }
    else {
        if(conf.sub.hasOwnProperty(count)) {
            var target = conf.sub[count].parent + '/' + conf.sub[count].name;
            sh_adn.delsub(target, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2002 || rsc == 2000 || rsc == 4105 || rsc == 4004) {
                    delete_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                }
                else {
                    callback(9999, count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

function create_sub_all(count, callback) {
    if(conf.sub.length == 0) {
        callback(2001, count);
    }
    else {
        if(conf.sub.hasOwnProperty(count)) {
            var parent = conf.sub[count].parent;
            var rn = conf.sub[count].name;
            var nu = conf.sub[count].nu;
            sh_adn.crtsub(parent, rn, nu, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                }
                else {
                    callback('9999', count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

var air_info = {};

function retrieve_my_cnt_name(callback) {
    sh_adn.rtvct('/Mobius/AIR/approval/'+conf.ae.name+'/la', 0, function (rsc, res_body, count) {
        if(rsc == 2000) {
            air_info = res_body[Object.keys(res_body)[0]].con;
            // // console.log(drone_info);

            conf.cnt = [];
            var info = {};
            info.parent = '/Mobius/' + air_info.space;// /Mobius/UMAY
            info.name = 'Air_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + air_info.space + '/Air_Data';// /Mobius/UMAY/Air_Data
            info.name = air_info.air;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_parent_cnt_name = info.parent + '/' + info.name; // /Mobius/UMAY/Air_Data/UMAY_airquality/
            my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name; // /Mobius/UMAY/Air_Data/UMAY_airquality/disarm
            
            info.parent = my_parent_cnt_name;
            info.name = my_sortie_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + air_info.space;// /Mobius/UMAY
            info.name = 'Mission_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + air_info.space + '/Mission_Data';// /Mobius/UMAY/Mission_Data
            info.name = air_info.air;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            air_parent_mission_name = info.parent + '/' + info.name;// /Mobius/UMAY/Mission_Data/UMAY_airquality
            air_mission_name = air_parent_mission_name + '/' + my_sortie_name;// /Mobius/UMAY/Mission_Data/UMAY_airquality/disarm

            info.parent = air_parent_mission_name;
            info.name = my_sortie_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            MQTT_SUBSCRIPTION_ENABLE = 1;
            sh_state = 'crtct';
            setTimeout(http_watchdog, normal_interval);
            callback();
        }
        else {
            console.log('x-m2m-rsc : ' + rsc + ' <----' + res_body);
            setTimeout(http_watchdog, retry_interval);
            callback();
        }
    });
}

setTimeout(http_watchdog, normal_interval);
function http_watchdog() {
    if (sh_state === 'crtae') {
        console.log('[sh_state] : ' + sh_state);
        sh_adn.crtae(conf.ae.parent, conf.ae.name, conf.ae.appid, function (status, res_body) {
            console.log(res_body);
            if (status == 2001) {
                ae_response_action(status, res_body, function (status, aeid) {
                    console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');
                    sh_state = 'rtvae';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                });
            }
            else if (status == 5106 || status == 4105) {
                console.log('x-m2m-rsc : ' + status + ' <----');
                sh_state = 'rtvae';

                setTimeout(http_watchdog, normal_interval);
            }
            else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    }
    else if (sh_state === 'rtvae') {
        if (conf.ae.id === 'S') {
            conf.ae.id = 'S' + shortid.generate();
        }

        console.log('[sh_state] : ' + sh_state);
        sh_adn.rtvae(conf.ae.parent + '/' + conf.ae.name, function (status, res_body) {
            if (status == 2000) {
                var aeid = res_body['m2m:ae']['aei'];
                console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');

                if(conf.ae.id != aeid && conf.ae.id != ('/'+aeid)) {
                    console.log('AE-ID created is ' + aeid + ' not equal to device AE-ID is ' + conf.ae.id);
                }
                else {
                    sh_state = 'rtvct';
                    request_count = 0;
                    return_count = 0;
                    setTimeout(http_watchdog, normal_interval);
                }
            }
            else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    }
    else if(sh_state === 'rtvct') {
        retrieve_my_cnt_name(function () {
        });
    }
    else if (sh_state === 'crtct') {
        console.log('[sh_state] : ' + sh_state);
        create_cnt_all(request_count, function (status, count) {
            if(status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            }
            else {
                request_count = ++count;
                return_count = 0;
                if (conf.cnt.length <= count) {
                    sh_state = 'delsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    }
    else if (sh_state === 'delsub') {
        console.log('[sh_state] : ' + sh_state);
        delete_sub_all(request_count, function (status, count) {
            if(status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            }
            else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    }
    else if (sh_state === 'crtsub') {
        console.log('[sh_state] : ' + sh_state);
        create_sub_all(request_count, function (status, count) {
            if(status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            }
            else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtci';

                    ready_for_notification();

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    }
    else if (sh_state === 'crtci') {
        send_to_Mobius(my_cnt_name, air_data_block);

        setTimeout(http_watchdog, data_interval);
    }
}

function send_to_Mobius(url, obj_content) {
    sh_adn.crtci(url+'?rcn=0', 0, obj_content, null, function () {
    });
}

// for notification
//var xmlParser = bodyParser.text({ type: '*/*' });

function mqtt_connect(serverip, noti_topic) {
    if(mqtt_client == null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
// username: 'keti',
// password: 'keti123',
                protocol: "mqtt",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            };
        }
        else {
            connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtts",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            };
        }

        mqtt_client = mqtt.connect(connectOptions);
    }

    mqtt_client.on('connect', function () {
        console.log('mqtt connected to ' + serverip);
        for(var idx in noti_topic) {
            if(noti_topic.hasOwnProperty(idx)) {
                mqtt_client.subscribe(noti_topic[idx]);
                console.log('[mqtt_connect] noti_topic[' + idx + ']: ' + noti_topic[idx]);
            }
        }
    });

    mqtt_client.on('message', function (topic, message) {
        if(topic.includes('/oneM2M/req/')) {
            var jsonObj = JSON.parse(message.toString());

            if (jsonObj['m2m:rqp'] == null) {
                jsonObj['m2m:rqp'] = jsonObj;
            }

            noti.mqtt_noti_action(topic.split('/'), jsonObj);
        }
        else {
        }
    });

    mqtt_client.on('error', function (err) {
        console.log(err.message);
    });
}

///////////////////////////////////////////////////////////////////////////////

var air_mqtt_client = null;
var air_noti_topic = [];

air_noti_topic.push('/res_co');
air_noti_topic.push('/res_co2');
air_noti_topic.push('/res_hcho');
air_noti_topic.push('/res_pm');
air_noti_topic.push('/res_tvoc');

function air_mqtt_connect(broker_ip, port, noti_topic) {
    if(air_mqtt_client == null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: broker_ip,
                port: port,
// username: 'keti',
// password: 'keti123',
                protocol: "mqtt",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            };
        }
        else {
            connectOptions = {
                host: broker_ip,
                port: port,
                protocol: "mqtts",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            };
        }

        air_mqtt_client = mqtt.connect(connectOptions);
    }

    air_mqtt_client.on('connect', function () {
        console.log('msw_mqtt connected to ' + broker_ip);
        for(var idx in noti_topic) {
            if(noti_topic.hasOwnProperty(idx)) {
                air_mqtt_client.subscribe(noti_topic[idx]);
                console.log('[msw_mqtt_connect] noti_topic[' + idx + ']: ' + noti_topic[idx]);
            }
        }
    });

    air_mqtt_client.on('message', function (topic, message) {
        try {
            var msg_obj = JSON.parse(message.toString());
        }
        catch (e) {
        }

        if(msg_obj.hasOwnProperty('val2')) {
            func[topic.replace('/', '')](msg_obj.val, msg_obj.val2);
        }
        else {
            func[topic.replace('/', '')](msg_obj.val);
        }
    });

    air_mqtt_client.on('error', function (err) {
        console.log(err.message);
    });
}

air_mqtt_connect('localhost', 1883, air_noti_topic);

///////////////////////////////////////////////////////////////////////////////

var air_data_block = {};
air_data_block.co = 0.0; // 0.5ppm
air_data_block.co2 = 0.0; // 675 ppm
air_data_block.tvoc = 0.0; // CO2: 400 PPM, TVOC: 0 PPB
air_data_block.mass_pm1_0 = 0.0;
air_data_block.mass_pm2_5 = 0.0;
air_data_block.mass_pm4_0 = 0.0;
air_data_block.mass_pm10_0 = 0.0;
air_data_block.number_pm0_5 = 0.0;
air_data_block.number_pm1_0 = 0.0;
air_data_block.number_pm2_5 = 0.0;
air_data_block.number_pm4_0 = 0.0;
air_data_block.number_pm10_0 = 0.0;
air_data_block.typical_particle_size = 0.0;
/*
Mass Concentration PM1.0:  6.3 ug/m^3
Mass Concentration PM2.5:  11.7 ug/m^3
Mass Concentration PM4.0:  15.5 ug/m^3
Mass Concentration PM10:  16.5 ug/m^3
Number Concentration PM0.5:  30.8 #/cm^3
Number Concentration PM1.0:  44.0 #/cm^3
Number Concentration PM2.5:  49.2 #/cm^3
Number Concentration PM4.0:  49.9 #/cm^3
Number Concentration PM10:  50.0 #/cm^3
Typical Particle Size:  0.7 um
*/

try {
    Object.assign(air_data_block, JSON.parse(fs.readFileSync('ddb.json', 'utf8')));
}
catch (e) {
    fs.writeFileSync('ddb.json', JSON.stringify(air_data_block, null, 4), 'utf8');
}

///////////////////////////////////////////////////////////////////////////////
// function of food dryer machine controling, sensing

var co_timer = null;
function req_co() {
    if(air_mqtt_client != null) {
        var msg_obj = {};

        msg_obj.val = 1;
        air_mqtt_client.publish('/req_co', JSON.stringify(msg_obj));

        clearTimeout(co_timer);
        co_timer = setTimeout(req_co, 5000);
    }
    else {
        clearTimeout(co_timer);
        co_timer = setTimeout(req_co, 1000 + parseInt(Math.random() * 1000));
    }
}

var co2_timer = null;
function req_co2() {
    if(air_mqtt_client != null) {
        var msg_obj = {};

        msg_obj.val = 1;
        air_mqtt_client.publish('/req_co2', JSON.stringify(msg_obj));

        clearTimeout(co2_timer);
        co2_timer = setTimeout(req_co2, 5000);
    }
    else {
        clearTimeout(co2_timer);
        co2_timer = setTimeout(req_co2, 1000 + parseInt(Math.random() * 1000));
    }
}

var tvoc_timer = null;
function req_tvoc() {
    if(air_mqtt_client != null) {
        var msg_obj = {};

        msg_obj.val = 1;
        air_mqtt_client.publish('/req_tvoc', JSON.stringify(msg_obj));

        clearTimeout(tvoc_timer);
        tvoc_timer = setTimeout(req_tvoc, 5000);
    }
    else {
        clearTimeout(tvoc_timer);
        tvoc_timer = setTimeout(req_tvoc, 1000 + parseInt(Math.random() * 1000));
    }
}

var pm_timer = null;
function req_pm() {
    if(air_mqtt_client != null) {
        var msg_obj = {};

        msg_obj.val = 1;
        air_mqtt_client.publish('/req_pm', JSON.stringify(msg_obj));

        clearTimeout(pm_timer);
        pm_timer = setTimeout(req_pm, 5000);
    }
    else {
        clearTimeout(pm_timer);
        pm_timer = setTimeout(req_pm, 1000 + parseInt(Math.random() * 1000));
    }
}

function res_co(val) {
    air_data_block.co = parseFloat(parseFloat(val.toString()).toFixed(1));

    // if (pre_internal_temp != air_data_block.co) {
    //     pre_internal_temp = air_data_block.co;

    var msg_obj = {};
    msg_obj.val = air_data_block.co;
        // air_mqtt_client.publish('/print_lcd_internal_temp', JSON.stringify(msg_obj));
    // }

    clearTimeout(co_timer);
    co_timer = setTimeout(req_co, 2000 + parseInt(Math.random() * 100));
}

function res_co2(val) {
    air_data_block.co2 = parseFloat(parseFloat(val.toString()).toFixed(1));

    // if (pre_internal_temp != air_data_block.co) {
    //     pre_internal_temp = air_data_block.co;

    var msg_obj = {};
    msg_obj.val = air_data_block.co2;
        // air_mqtt_client.publish('/print_lcd_internal_temp', JSON.stringify(msg_obj));
    // }

    clearTimeout(co2_timer);
    co2_timer = setTimeout(req_co2, 2000 + parseInt(Math.random() * 100));
}

function res_tvoc(val) {
    air_data_block.tvoc = parseFloat(parseFloat(val.toString()).toFixed(1));

    // if (pre_internal_temp != air_data_block.co) {
    //     pre_internal_temp = air_data_block.co;

    var msg_obj = {};
    msg_obj.val = air_data_block.tvoc;
        // air_mqtt_client.publish('/print_lcd_internal_temp', JSON.stringify(msg_obj));
    // }

    clearTimeout(tvoc_timer);
    tvoc_timer = setTimeout(req_tvoc, 2000 + parseInt(Math.random() * 100));
}

function res_pm(val, val2, val3, val4, val5, val6, val7, val8, val9, val10) {
    air_data_block.mass_pm1_0 = parseFloat(parseFloat(val.toString()).toFixed(1));
    air_data_block.mass_pm2_5 = parseFloat(parseFloat(val2.toString()).toFixed(1));
    air_data_block.mass_pm4_0 = parseFloat(parseFloat(val3.toString()).toFixed(1));
    air_data_block.mass_pm10_0 = parseFloat(parseFloat(val4.toString()).toFixed(1));
    air_data_block.number_pm0_5 = parseFloat(parseFloat(val5.toString()).toFixed(1));
    air_data_block.number_pm1_0 = parseFloat(parseFloat(val6.toString()).toFixed(1));
    air_data_block.number_pm2_5 = parseFloat(parseFloat(val7.toString()).toFixed(1));
    air_data_block.number_pm4_0 = parseFloat(parseFloat(val8.toString()).toFixed(1));
    air_data_block.number_pm10_0 = parseFloat(parseFloat(val9.toString()).toFixed(1));
    air_data_block.typical_particle_size = parseFloat(parseFloat(val10.toString()).toFixed(1));

    // if (pre_internal_temp != air_data_block.co) {
    //     pre_internal_temp = air_data_block.co;

    var msg_obj = {};
    msg_obj.val = air_data_block.mass_pm1_0;
    msg_obj.val2 = air_data_block.mass_pm2_5;
    msg_obj.val3 = air_data_block.mass_pm4_0;
    msg_obj.val4 = air_data_block.mass_pm10_0;
    msg_obj.val5 = air_data_block.number_pm0_5;
    msg_obj.val6 = air_data_block.number_pm1_0;
    msg_obj.val7 = air_data_block.number_pm2_5;
    msg_obj.val8 = air_data_block.number_pm4_0;
    msg_obj.val9 = air_data_block.number_pm10_0;
    msg_obj.val10 = air_data_block.typical_particle_size;
        // air_mqtt_client.publish('/print_lcd_internal_temp', JSON.stringify(msg_obj));
    // }

    clearTimeout(pm_timer);
    pm_timer = setTimeout(req_pm, 2000 + parseInt(Math.random() * 100));
}

// function set_dcmotor(command) {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = command;
//         air_mqtt_client.publish('/set_solenoid', JSON.stringify(msg_obj));
//     }
// }




// function req_zero_point() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = dry_data_block.loadcell_ref_weight;
//         //console.log(dry_data_block.loadcell_ref_weight)
//         air_mqtt_client.publish('/req_zero_point', JSON.stringify(msg_obj));
//     }
// }

// function req_calc_factor() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = dry_data_block.loadcell_factor;
//         air_mqtt_client.publish('/req_calc_factor', JSON.stringify(msg_obj));
//     }
// }

// var internal_temp_timer = null;
// function req_internal_temp() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};

//         if(dry_data_block.state == 'INIT') {
//         }
//         else if(dry_data_block.state == 'DEBUG') {
//         }
//         else {
//             msg_obj.val = 1;
//             air_mqtt_client.publish('/req_internal_temp', JSON.stringify(msg_obj));
//             //console.log(msg_obj.val);
//         }

//         console.log('/req_internal_temp');

//         clearTimeout(internal_temp_timer);
//         internal_temp_timer = setTimeout(req_internal_temp, 5000);
//     }
//     else {
//         clearTimeout(internal_temp_timer);
//         internal_temp_timer = setTimeout(req_internal_temp, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// var input_door_timer = null;
// function req_input_door() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = 1;
//         air_mqtt_client.publish('/req_input_door', JSON.stringify(msg_obj));

//         clearTimeout(input_door_timer);
//         input_door_timer = setTimeout(req_input_door, 1000);
//     }
//     else {
//         clearTimeout(input_door_timer);
//         input_door_timer = setTimeout(req_input_door, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// var output_door_timer = null;
// function req_output_door() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = 1;
//         air_mqtt_client.publish('/req_output_door', JSON.stringify(msg_obj));

//         clearTimeout(output_door_timer);
//         output_door_timer = setTimeout(req_output_door, 1000);
//     }
//     else {
//         clearTimeout(output_door_timer);
//         output_door_timer = setTimeout(req_output_door, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// var safe_door_timer = null;
// function req_safe_door() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = 1;
//         air_mqtt_client.publish('/req_safe_door', JSON.stringify(msg_obj));

//         clearTimeout(safe_door_timer);
//         safe_door_timer = setTimeout(req_safe_door, 1000);
//     }
//     else {
//         clearTimeout(safe_door_timer);
//         safe_door_timer = setTimeout(req_safe_door, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// var weight_timer = null;
// function req_weight() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};

//         if(dry_data_block.state == 'INIT') {
//         }
//         else if(dry_data_block.state == 'DEBUG') {
//         }
//         else {
//             msg_obj.val = 1;
//             air_mqtt_client.publish('/req_weight', JSON.stringify(msg_obj));
//             console.log('/req_weight');
//         }

//         clearTimeout(weight_timer);
//         weight_timer = setTimeout(req_weight, 5000);
//     }
//     else {
//         clearTimeout(weight_timer);
//         weight_timer = setTimeout(req_weight, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// var operation_mode_timer = null;
// function req_operation_mode() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = 1;
//         air_mqtt_client.publish('/req_operation_mode', JSON.stringify(msg_obj));

//         clearTimeout(operation_mode_timer);
//         operation_mode_timer = setTimeout(req_operation_mode, 1000);
//     }
//     else {
//         clearTimeout(operation_mode_timer);
//         operation_mode_timer = setTimeout(req_operation_mode, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// var debug_mode_timer = null;
// function req_debug_mode() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = 1;
//         air_mqtt_client.publish('/req_debug_mode', JSON.stringify(msg_obj));
//         //console.log(msg_obj.val);

//         clearTimeout(debug_mode_timer);
//         debug_mode_timer = setTimeout(req_debug_mode, 1000);
//     }
//     else {
//         clearTimeout(debug_mode_timer);
//         debug_mode_timer = setTimeout(req_debug_mode, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// var start_btn_timer = null;
// function req_start_btn() {
//     if(air_mqtt_client != null) {
//         var msg_obj = {};
//         msg_obj.val = 1;
//         air_mqtt_client.publish('/req_start_btn', JSON.stringify(msg_obj));

//         clearTimeout(start_btn_timer);
//         start_btn_timer = setTimeout(req_start_btn, 1000);
//     }
//     else {
//         clearTimeout(start_btn_timer);
//         start_btn_timer = setTimeout(req_start_btn, 1000 + parseInt(Math.random() * 1000));
//     }
// }

// function res_zero_point(val) {
//     //dry_data_block.loadcell_factor = parseFloat(val.toString()).toFixed(1);

//     debug_mode_state = 'put_on';
// }

// function res_calc_factor(val, val2) {
//     dry_data_block.loadcell_factor = parseFloat(parseFloat(val.toString()).toFixed(1));
//     dry_data_block.correlation_value = parseFloat(parseFloat(val2.toString()).toFixed(2));

//     debug_mode_state = 'complete';
// }


// function res_internal_temp(val, val2) {
//     dry_data_block.internal_temp = parseFloat(parseFloat(val.toString()).toFixed(1));
//     dry_data_block.external_temp = parseFloat(parseFloat(val2.toString()).toFixed(1));

//     if (pre_internal_temp != dry_data_block.internal_temp) {
//         pre_internal_temp = dry_data_block.internal_temp;

//         var msg_obj = {};
//         msg_obj.val = dry_data_block.internal_temp;
//         msg_obj.val2 = dry_data_block.external_temp;
//         air_mqtt_client.publish('/print_lcd_internal_temp', JSON.stringify(msg_obj));
//     }

//     clearTimeout(internal_temp_timer);
//     internal_temp_timer = setTimeout(req_internal_temp, 2000 + parseInt(Math.random() * 100));
// }

// var input_door_close_count = 0;
// var input_door_open_count = 0;
// var output_door_close_count = 0;
// var output_door_open_count = 0;
// var safe_door_close_count = 0;
// var safe_door_open_count = 0;

// const DOOR_OPEN = 1;
// const DOOR_CLOSE = 0;

// const BTN_PRESS = 0;

// function res_input_door(val) {
//     var l_dec_val = parseInt(val.toString());
// //     console.log('\nl_dec_val: ' + l_dec_val);
//     var input_door = 0;
//     var output_door = 0;
//     var safe_door = 0;
//     var start_btn = 0;
//     var debug_btn = 0;

//     if(l_dec_val&0x01) {
//         input_door = 1;
//     }

//     if(l_dec_val&0x02) {
//         output_door = 1;
//     }

//     if(l_dec_val&0x04) {
//         safe_door = 1;
//     }

//     if(l_dec_val&0x08) {
//         start_btn = 1;
//     }

//     if(l_dec_val&0x10) {
//         debug_btn = 1;
//     }

//     var status = input_door;

//     //console.log('in:' + status);

//     if(status == DOOR_CLOSE) {
//         input_door_close_count++;
//         input_door_open_count = 0;
//         if(input_door_close_count > 2) {
//             input_door_close_count = 2;

//             dry_data_block.input_door = DOOR_CLOSE;
//         }
//     }
//     else {
//         input_door_close_count = 0;
//         input_door_open_count++;
//         if(input_door_open_count > 2) {
//             input_door_open_count = 2;

//             dry_data_block.input_door = DOOR_OPEN;
//         }
//     }

//     status = output_door;

//     //console.log('out:' + status);

//     if(status == DOOR_CLOSE) {
//         output_door_close_count++;
//         output_door_open_count = 0;
//         if(output_door_close_count > 2) {
//             output_door_close_count = 2;

//             if(dry_data_block.output_door == DOOR_OPEN) {
//                 // dryer_event |= EVENT_OUTPUT_DOOR_CLOSE;
//             }

//             dry_data_block.output_door = DOOR_CLOSE;
//         }
//     }
//     else {
//         output_door_close_count = 0;
//         output_door_open_count++;
//         if(output_door_open_count > 2) {
//             output_door_open_count = 2;

//             if(dry_data_block.output_door == DOOR_CLOSE) {
//                 // dryer_event |= EVENT_OUTPUT_DOOR_OPEN;
//             }

//             dry_data_block.output_door = DOOR_OPEN;
//         }
//     }

//     status = safe_door;

//     //console.log('safe:' + status);

//     if(status == DOOR_CLOSE) {
//         safe_door_close_count++;
//         safe_door_open_count = 0;
//         if(safe_door_close_count > 2) {
//             safe_door_close_count = 2;

//             if(dry_data_block.safe_door == DOOR_OPEN) {
//                 dryer_event |= EVENT_SAFE_DOOR_CLOSE;
//             }

//             dry_data_block.safe_door = DOOR_CLOSE;
//         }
//     }
//     else {
//         safe_door_close_count = 0;
//         safe_door_open_count++;
//         if(safe_door_open_count > 2) {
//             safe_door_open_count = 2;

//             if(dry_data_block.safe_door == DOOR_CLOSE) {
//                 dryer_event |= EVENT_SAFE_DOOR_OPEN;
//             }

//             dry_data_block.safe_door = DOOR_OPEN;
//         }
//     }

//     res_debug_mode(debug_btn);
//     res_start_btn(start_btn);

//     //clearTimeout(input_door_timer);
//     //input_door_timer = setTimeout(req_input_door, 100 + parseInt(Math.random() * 100));
//     //console.log(dry_data_block.input_door);
// }

// var output_door_close_count = 0;
// var output_door_open_count = 0;
// function res_output_door(val) {
//     var status = parseInt(val.toString());
//
// //     console.log('out:' + status);
//
//     if(status == DOOR_CLOSE) {
//         output_door_close_count++;
//         output_door_open_count = 0;
//         if(output_door_close_count > 2) {
//             output_door_close_count = 2;
//
//             if(dry_data_block.output_door == DOOR_OPEN) {
//                 dryer_event |= EVENT_OUTPUT_DOOR_CLOSE;
//             }
//
//             dry_data_block.output_door = DOOR_CLOSE;
//         }
//     }
//     else {
//         output_door_close_count = 0;
//         output_door_open_count++;
//         if(output_door_open_count > 2) {
//             output_door_open_count = 2;
//
//             if(dry_data_block.output_door == DOOR_CLOSE) {
//                 dryer_event |= EVENT_OUTPUT_DOOR_OPEN;
//             }
//
//             dry_data_block.output_door = DOOR_OPEN;
//         }
//     }
//
//     //clearTimeout(output_door_timer);
//     //output_door_timer = setTimeout(req_output_door, 100 + parseInt(Math.random() * 100));
// }
//
// var safe_door_close_count = 0;
// var safe_door_open_count = 0;
// function res_safe_door(val) {
//     var status = parseInt((val).toString());
//
// //     console.log('safe:' + status);
//
//     if(status == DOOR_CLOSE) {
//         safe_door_close_count++;
//         safe_door_open_count = 0;
//         if(safe_door_close_count > 2) {
//             safe_door_close_count = 2;
//
//             if(dry_data_block.safe_door == DOOR_OPEN) {
//                 dryer_event |= EVENT_SAFE_DOOR_CLOSE;
//             }
//
//             dry_data_block.safe_door = DOOR_CLOSE;
//         }
//     }
//     else {
//         safe_door_close_count = 0;
//         safe_door_open_count++;
//         if(safe_door_open_count > 2) {
//             safe_door_open_count = 2;
//
//             if(dry_data_block.safe_door == DOOR_CLOSE) {
//                 dryer_event |= EVENT_SAFE_DOOR_OPEN;
//             }
//
//             dry_data_block.safe_door = DOOR_OPEN;
//         }
//     }
//
//     //clearTimeout(safe_door_timer);
//     //safe_door_timer = setTimeout(req_safe_door, 100 + parseInt(Math.random() * 100));
// }

// function res_weight(val) {
// //     console.log('weight: ' + val);
//     dry_data_block.cur_weight = parseFloat(parseFloat(val.toString()).toFixed(1));
//     console.log("\r\ncur_weight: " + dry_data_block.cur_weight + "\r\n");
//     if (pre_cur_weight != dry_data_block.cur_weight) {
//         //console.log(dry_data_block.cur_weight);
//         pre_cur_weight = dry_data_block.cur_weight;


//         var msg_obj = {};
//         msg_obj.val = dry_data_block.cur_weight;
//         msg_obj.val2 = dry_data_block.tar_weight3;
//         air_mqtt_client.publish('/print_lcd_loadcell', JSON.stringify(msg_obj));
//     }

//     clearTimeout(weight_timer);
//     weight_timer = setTimeout(req_weight, 1500 + parseInt(Math.random() * 100));
// }

// var operation_press_count = 0;
// var operation_release_count = 0;
// function res_operation_mode(val) {
//     var status = parseInt(val.toString());
//     //console.log(status);
//     if(status == 0) {
//         operation_press_count++;
//         operation_release_count = 0;
//         if(operation_press_count > 2) {
//             operation_press_count = 2;
//             dry_data_block.operation_mode = 0;
//         }
//     }
//     else {
//         operation_press_count = 0;
//         operation_release_count++;
//         if(operation_release_count > 2) {
//             operation_release_count = 2;
//             dry_data_block.operation_mode = 1;
//         }
//     }

//     //clearTimeout(operation_mode_timer);
//     //operation_mode_timer = setTimeout(req_operation_mode, 100 + parseInt(Math.random() * 100));
// }

// var debug_press_count = 0;
// var debug_release_count = 0;
// var debug_once = 0;
// function res_debug_mode(val) {
//     var status = parseInt(val.toString());

//     if(status == BTN_PRESS) {
//         debug_press_count++;
//         debug_release_count = 0;
//         if(debug_press_count > 3) {
//             debug_press_count = 3;
//             dry_data_block.debug_mode = 1;

//             if(debug_once == 1) {
//                 debug_once = 0;
//                 dryer_event_2 |= EVENT_DEBUG_BUTTON_PRESS;
//             }
//         }
//     }
//     else {
//         debug_press_count = 0;
//         debug_release_count++;
//         if(debug_release_count > 3) {
//             debug_release_count = 3;
//             dry_data_block.debug_mode = 0;

//             if(debug_once == 0) {
//                 debug_once = 1;
//                 dryer_event_2 |= EVENT_DEBUG_BUTTON_RELEASE;
//             }
//         }
//     }

//     //clearTimeout(debug_mode_timer);
//     //debug_mode_timer = setTimeout(req_debug_mode, 100 + parseInt(Math.random() * 100));
// }


// var start_press_count = 0;
// var start_press_flag = 0;
// function res_start_btn(val) {
//     var status = parseInt(val.toString());

//     if(status == BTN_PRESS) {
//         start_press_count++;
//         if(4 < start_press_count && start_press_count <= 48) {
//             start_press_flag = 1;
//         }

//         else if(48 < start_press_count) {
//             start_press_flag = 2;
            
//             // dry_data_block.debug_message = 'LONG BTN CLICK';
//         }
//     }
//     else {
//         if(start_press_flag == 1) {
//             dry_data_block.start_btn = 1;

//             dryer_event |= EVENT_START_BUTTON;
            
//             start_press_count = 0;

//         }
//         else if(start_press_flag == 2) {
//             dry_data_block.start_btn = 2;
            
//             dry_data_block.debug_message = '              ';

//             dryer_event |= EVENT_START_BTN_LONG;
//             start_press_count = 0;
//         }

//         start_press_flag = 0;
//         start_press_count = 0;
//     }

//     //clearTimeout(start_btn_timer);
//     //start_btn_timer = setTimeout(req_start_btn, 100 + parseInt(Math.random() * 100));
// }

// ///////////////////////////////////////////////////////////////////////////////

// var always_tick = 0;
// var toggle_command = 1;
// setTimeout(always_watchdog, first_interval);

// function always_watchdog() {
//     // - 내부온도 60도 이상 순환팬과 열교환기 냉각팬, 펌프 온
//     // - 내부온도 60도 미만 순환팬과 열교환기 냉각팬, 펌프 오프

//     if(parseFloat(dry_data_block.internal_temp) < 30.0) {
//         // 순환팬 오프
//         // 열교환기 냉각팬 오프

//         set_fan(TURN_OFF);
//     }
//     else if(parseFloat(dry_data_block.internal_temp) >= 30.0) {
//         // 순환팬 온
//         // 열교환기 냉각팬 온

//         set_fan(TURN_ON);
//     }

//     setTimeout(always_watchdog, always_interval);
// }

// ///////////////////////////////////////////////////////////////////////////////

// setTimeout(lcd_display_watchdog, display_interval);

// function lcd_display_watchdog() {
//     if(dry_data_block.state == 'DEBUG') {
//         setTimeout(print_lcd_state, parseInt(Math.random() * 10));
//         setTimeout(print_lcd_loadcell_factor, parseInt(Math.random() * 10));
//         setTimeout(print_lcd_debug_message, parseInt(Math.random() * 10));
//     }
//     else {
//         setTimeout(print_lcd_state, parseInt(Math.random() * 10));
//         setTimeout(print_lcd_input_door, parseInt(Math.random() * 10));
//         setTimeout(print_lcd_output_door, parseInt(Math.random() * 10));
//         setTimeout(print_lcd_safe_door, parseInt(Math.random() * 10));
//         setTimeout(print_lcd_elapsed_time, 0);
//         setTimeout(print_lcd_debug_message, parseInt(Math.random() * 10));
//     }

//     setTimeout(lcd_display_watchdog, display_interval);
// }


// ///////////////////////////////////////////////////////////////////////////////

// var debug_mode_state = 'start';

// //setTimeout(core_watchdog, 2000);

// setTimeout(mon_input_door, 250);
// setTimeout(mon_output_door, 250);
// setTimeout(mon_safe_door, 250);

// var input_door_once = 0;
// function mon_input_door() {
//     if (dry_data_block.input_door == DOOR_CLOSE){
//         if (input_door_once == 0) {
//             dryer_event |= EVENT_INPUT_DOOR_CLOSE;
//             input_door_once = 1;
//         }
//         setTimeout(mon_input_door, 250);
//     }
//     else if (dry_data_block.input_door == DOOR_OPEN){
//         input_door_once = 0;
//         dryer_event |= EVENT_INPUT_DOOR_OPEN;
//         setTimeout(mon_input_door, 5000);
//     }

// }

// var output_door_once = 0;
// function mon_output_door() {
//     if (dry_data_block.output_door == DOOR_CLOSE){
//         if (output_door_once == 0) {
//             dryer_event |= EVENT_OUTPUT_DOOR_CLOSE;
//             output_door_once = 1;
//         }
//         setTimeout(mon_output_door, 250);
//     }
//     else if (dry_data_block.output_door == DOOR_OPEN){
//         output_door_once = 0;
//         dryer_event |= EVENT_OUTPUT_DOOR_OPEN;
//         setTimeout(mon_output_door, 5000);
//     }
// }

// var safe_door_once = 0;
// function mon_safe_door() {
//     if (dry_data_block.safe_door == DOOR_CLOSE){
//         if (safe_door_once == 0) {
//             dryer_event |= EVENT_SAFE_DOOR_CLOSE;
//             safe_door_once = 1;
//         }
//         setTimeout(mon_safe_door, 250);
//     }
//     else if (dry_data_block.input_door == DOOR_OPEN){
//         safe_door_once = 0;
//         dryer_event |= EVENT_SAFE_DOOR_OPEN;
//         setTimeout(mon_safe_door, 5000);
//     }
// }

// setTimeout(heat_watchdog, 1000);

// function heat_watchdog() {
//     if (dry_data_block.state == 'INPUT'){
//         set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//         set_stirrer(TURN_OFF);
//     }
//     else if(dry_data_block.state == 'DEBUG') {
//         if (debug_mode_state == 'start') {
//             console.log("Start zero point");

//             dry_data_block.debug_message = 'Start zero point';
//             pre_debug_message = '';

//             req_zero_point();

//             debug_mode_state = 'start_waiting';

//             //setTimeout(core_watchdog, normal_interval);
//         }
//         else if (debug_mode_state == 'put_on') {
//             dry_data_block.debug_message = 'Put weight on - ' + dry_data_block.loadcell_ref_weight;
//             pre_debug_message = '';

//             debug_mode_state = 'put_on_waiting';

//             //setTimeout(core_watchdog, normal_interval);
//         }
//         else if (debug_mode_state == 'complete') {
//             dry_data_block.debug_message = 'Complete zero point';
//             pre_debug_message = '';

//             debug_mode_state = 'completed';

//             var obj = {};
//             obj.loadcell_factor = dry_data_block.loadcell_factor;
//             obj.correlation_value = dry_data_block.correlation_value;
//             send_to_Mobius(zero_mission_name, obj);
//         }
//         else {
//         }
//     }
//     else if (dry_data_block.state == 'HEAT'){
//         dry_data_block.elapsed_time++;

//         if(parseFloat(dry_data_block.external_temp) < parseFloat(dry_data_block.ref_external_temp) && parseFloat(dry_data_block.internal_temp) < parseFloat(dry_data_block.ref_internal_temp)) {
//             set_heater(TURN_ON, TURN_ON, TURN_ON);
//             set_stirrer(TURN_ON);
//         }
//         else {
//             set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//             set_stirrer(TURN_ON);
//         }

//         cur_weight = parseFloat(dry_data_block.cur_weight) - parseFloat(dry_data_block.pre_weight)

//         if (cur_weight <= parseFloat(dry_data_block.tar_weight3) || dry_data_block.elapsed_time > (parseInt(dry_data_block.ref_elapsed_time)*60*60)) {
//             dry_data_block.cum_weight += dry_data_block.ref_weight;

//             //console.log('heater 0');

//             dry_data_block.ref_weight = 0.0;
//             dry_data_block.pre_weight = 0.0;
//             dry_data_block.tar_weight1 = 0.0;
//             dry_data_block.tar_weight2 = 0.0;
//             dry_data_block.tar_weight3 = 0.0;

//             fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');

//             dry_data_block.state = 'END';
//             pre_state = '';

//             dry_data_block.my_sortie_name = 'disarm';
//             send_to_Mobius(my_cnt_name, dry_data_block);

//             set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//             set_stirrer(TURN_OFF);

//             set_buzzer();

//             my_sortie_name = 'disarm';
//             my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;

//             dryer_event_2 |= EVENT_HEAT_COMPLETE;
//         }
//     }
//     else if (dry_data_block.state == 'EXHAUST'){
//         if (dry_data_block.cur_weight <= 0.5){
//             dryer_event_2 |= EVENT_EXHAUST_COMPLETE;
//         }
//     }
//     else if (dry_data_block.state == 'TARGETING') {
//         dry_data_block.elapsed_time = 0;
        
//         set_stirrer(TURN_ON);
//         targeting_tick_count++;
//         if(targeting_tick_count >= (60*6)) {
//             dry_data_block.ref_weight = dry_data_block.ref_weight + dry_data_block.cur_weight - dry_data_block.pre_weight;

//             dry_data_block.tar_weight1 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.60).toFixed(1));
//             dry_data_block.tar_weight2 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.30).toFixed(1));
//             dry_data_block.tar_weight3 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.10).toFixed(1));

//             fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');

//             console.log(dry_data_block.state);
//             dry_data_block.state = 'HEAT';
//             pre_state = '';
//             console.log('->' + dry_data_block.state);

//             dry_data_block.my_sortie_name = moment().utc().format('YYYY_MM_DD_T_HH');
//             send_to_Mobius(my_cnt_name, dry_data_block);

//             dry_data_block.debug_message = ' ';
//             pre_debug_message = '';

//             set_heater(TURN_ON, TURN_ON, TURN_ON);
//             set_stirrer(TURN_ON);

//             my_sortie_name = moment().utc().format('YYYY_MM_DD_T_HH');
//             my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
//             sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
//             });
//         }
//     }
    
//     setTimeout(heat_watchdog, 1000);
// }

// function do_before_input() {
//     dry_data_block.input_door = 0;
//     dry_data_block.output_door = 0;
//     dry_data_block.safe_door = 0;

//     sh_adn.rtvct(zero_mission_name+'/la', 0, function (rsc, res_body, count) {
//         if (rsc == 2000) {
//             var zero_obj = res_body[Object.keys(res_body)[0]].con;

//             dry_data_block.loadcell_factor = zero_obj.loadcell_factor;
//             dry_data_block.correlation_value = zero_obj.correlation_value;

//             if(air_mqtt_client != null) {
//                 var msg_obj = {};
//                 msg_obj.val = dry_data_block.loadcell_factor;
//                 msg_obj.val2 = dry_data_block.correlation_value;
//                 air_mqtt_client.publish('/set_zero_point', JSON.stringify(msg_obj));
//             }
//         }
//     });

//     dry_data_block.debug_message = ' ';
//     pre_debug_message = '';
//     pre_input_door = -1;
//     pre_output_door = -1;
//     pre_safe_door = -1;
//     pre_elapsed_time = -1;
//     pre_cur_weight = 9999;

//     dry_data_block.cur_weight = -0.1;
//     dry_data_block.ref_weight = 0.0;
//     dry_data_block.pre_weight = 0.0;
//     dry_data_block.tar_weight1 = 0.0;
//     dry_data_block.tar_weight2 = 0.0;
//     dry_data_block.tar_weight3 = 0.0;

//     pre_cur_weight = dry_data_block.cur_weight;
    
//     console.log(dry_data_block.state);
//     dry_data_block.state = 'INPUT';
//     pre_state = '';
//     console.log('->' + dry_data_block.state);

//     set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//     set_stirrer(TURN_OFF);
//     set_lift(TURN_BACK);
//     set_crusher(TURN_OFF);
//     set_cleaning_pump(TURN_OFF);
    
//     set_buzzer();
// }

// do_before_input();

// setTimeout(dryer_event_handler, 100);

// function dryer_event_handler() {
//     if (dryer_event & EVENT_INPUT_DOOR_OPEN) {
//         dryer_event &= ~EVENT_INPUT_DOOR_OPEN;
//         if (dry_data_block.state != 'DEBUG') {
//             // console.log("dryer event handler door open");
//             dry_data_block.debug_message = 'Close input door';
//             set_buzzer();
//             //set_stirrer(TURN_OFF);
//             //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//         }
//     } 
//     else if (dryer_event & EVENT_INPUT_DOOR_CLOSE) {
//         dryer_event &= ~EVENT_INPUT_DOOR_CLOSE;
//         if (dry_data_block.state != 'DEBUG') {
//             dry_data_block.debug_message = '                ';
//         }
//     }

//     else if (dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
//         dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
//         if (dry_data_block.state == 'DEBUG') {
//             //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//             //set_stirrer(TURN_ON);
//         } 
//         else if (dry_data_block.state == 'EXHAUST') {
//             //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//             set_stirrer(TURN_ON);
//         } 
//         else {
//             dry_data_block.debug_message = 'Close output door';
//             set_buzzer();
//             set_stirrer(TURN_OFF);
//             //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//         }
//     } 
//     else if (dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
//         dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
//         if (dry_data_block.state != 'DEBUG') {
//             dry_data_block.debug_message = '                ';
//         }
//     }

//     else if (dryer_event & EVENT_SAFE_DOOR_OPEN) {
//         dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
//         if (dry_data_block.state != 'DEBUG') {
//             dry_data_block.debug_message = 'Close safe door';
//             set_buzzer();
//         }
//     } 
//     else if (dryer_event & EVENT_SAFE_DOOR_CLOSE) {
//         dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
//         if (dry_data_block.state != 'DEBUG') {
//             dry_data_block.debug_message = '                ';
//         }
//     }

//     else if (dryer_event_2 & EVENT_HEAT_COMPLETE) {
//         dryer_event_2 &= ~EVENT_HEAT_COMPLETE;
//         if (dry_data_block.state == 'HEAT') {
//             dry_data_block.debug_message = 'HEAT complete';

//             set_buzzer();
//             set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//             set_stirrer(TURN_OFF);

//             dry_data_block.state = 'END';
//             pre_state = '';

//         }
//         dryer_event_2 |= EVENT_END_ACTION;
//     }

//     else if (dryer_event & EVENT_START_BUTTON) {
//         dryer_event &= ~EVENT_START_BUTTON;
//         // dry_data_block.start_btn = 1;
//         if (dry_data_block.state == 'INPUT') {
//             dry_data_block.debug_message = '              ';
            
//             //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
//             set_heater(TURN_ON, TURN_ON, TURN_ON);
//             set_stirrer(TURN_ON);
//             set_lift(TURN_OFF);
//             set_crusher(TURN_OFF);
//             set_cleaning_pump(TURN_OFF);

//             console.log(dry_data_block.state + '->' + dry_data_block.state);
//             dry_data_block.state = 'TARGETING';
//             pre_state = '';

//             lift_seq = 0;
//             crusher_seq = 0;
            
//             lifting();
//             crusher();

//             targeting_tick_count = 0;

//             dry_data_block.pre_weight = dry_data_block.cur_weight;
//         }

//         else if (dry_data_block.state == 'DEBUG') {
//             if(debug_mode_state == 'put_on_waiting') {

//                 dry_data_block.debug_message = 'Calculating';
//                 pre_debug_message = '';

//                 req_calc_factor();
//             }
//         }
//     }
    
//     else if(dryer_event & EVENT_START_BTN_LONG) {
//         dryer_event &= ~EVENT_START_BTN_LONG;
//         // dry_data_block.start_btn = 2;
//         if (dry_data_block.state == 'INPUT') {
//             dry_data_block.debug_message = 'Reset the catalyst';
//             pre_debug_message = '';
//             set_buzzer();

//             dry_data_block.cum_weight = 0;
//         }
//         else if (dry_data_block.state == 'DEBUG'){
//             dry_data_block.debug_message = 'Being Update';
//             var tas_dryer = spawn('sh', ['./update.sh']);
//             tas_dryer.stdout.on('data', function(data) {
//                 console.log('Being Update');
//                 console.log('stdout: ' + data);
//             });
//             tas_dryer.on('exit', function(code) {
//                 console.log('exit: ' + code);
//             });
//             tas_dryer.on('error', function(code) {
//                 console.log('error: ' + code);
//             });
//         }
//      }

//     else if (dryer_event_2 & EVENT_DEBUG_BUTTON_PRESS) {
//         dryer_event_2 &= ~EVENT_DEBUG_BUTTON_PRESS;
//         if (dry_data_block.state == 'INPUT') {
//             pre_cur_weight = dry_data_block.cur_weight;

//             if (dry_data_block.debug_mode == 1) {
//                 debug_mode_state = 'start';

//                 console.log(dry_data_block.state);
//                 dry_data_block.state = 'DEBUG';
//                 pre_state = '';
//                 console.log('->' + dry_data_block.state);

//                 set_buzzer();
//             }
//             else {
//                 pre_input_door = -1;
//                 pre_output_door = -1;
//                 pre_safe_door = -1;
//                 pre_cur_weight = 9999;
//             }
//         }
//     }
    
//     else if (dryer_event_2 & EVENT_DEBUG_BUTTON_RELEASE) {
//         dryer_event_2 &= ~EVENT_DEBUG_BUTTON_RELEASE;
//         if (dry_data_block.state == 'DEBUG'){
//             if (dry_data_block.debug_mode == 0) {
//                 do_before_input();
//             }
//         }
//     }

//     else if (dryer_event_2 & EVENT_EXHAUST_COMPLETE) {
//         dryer_event_2 &= ~EVENT_EXHAUST_COMPLETE;
//         if (dry_data_block.state == 'EXHAUST') {
//             do_before_input();
//         }
//     }

//     else if (dryer_event_2 & EVENT_END_ACTION) {
//         dryer_event_2 &= ~EVENT_END_ACTION;
//         if (dry_data_block.state == 'END') {
//             do_before_input();
//         }
//     }

//     setTimeout(dryer_event_handler, 100);
// }

// setTimeout(check_cum_ref_weight, 20000);

// function check_cum_ref_weight() {
//     if (dry_data_block.state == 'INPUT') {
//         if (dry_data_block.cum_weight > dry_data_block.cum_ref_weight) {
//             dry_data_block.debug_message = 'Exchange catalyst';
//             pre_debug_message = '';
//             set_buzzer();
            
//             dry_data_block.state = 'EXHAUST'
//             pre_state = '';
//         }
//     }
//     setTimeout(check_cum_ref_weight, 20000);
// }


// var input_door_delay_count = 0;
// var output_door_delay_count = 0;
// var safe_door_delay_count = 0;
// var exception_delay_count = 0;

// var lift_seq = 0;
// function lifting() {
//     if(lift_seq == 0) {
//         set_lift(TURN_OFF);

//         lift_seq = 1;
//         setTimeout(lifting, 10);
//     }
//     else if(lift_seq == 1) {
//         set_lift(TURN_ON);

//         lift_seq = 2;
//         setTimeout(lifting, 20000);
//     }
//     else if(lift_seq == 2) {
//         set_lift(TURN_OFF);

//         lift_seq = 3;
//         setTimeout(lifting, 10);
//     }
//     else if(lift_seq == 3) {
//         set_lift(TURN_BACK);

//         lift_seq = 4;
//         setTimeout(lifting, 1000);
//     }
//     else if(lift_seq == 4) {
//         set_lift(TURN_OFF);

//         lift_seq = 5;
//         setTimeout(lifting, 10);
//     }
//     else if(lift_seq == 5) {
//         set_lift(TURN_ON);

//         lift_seq = 6;
//         setTimeout(lifting, 5000);
//     }
//     else if(lift_seq == 6) {
//         set_lift(TURN_OFF);

//         lift_seq = 7;
//         setTimeout(lifting, 10);
//     }
//     else if(lift_seq == 7) {
//         set_lift(TURN_BACK);

//         lift_seq = 8;
//         setTimeout(lifting, 16000);
//     }
//     else if(lift_seq == 8) {
//         set_lift(TURN_OFF);

//         lift_seq = 0;
//     }
// }
// var crusher_seq = 0;
// function crusher() {
//     if(crusher_seq == 0) {
//         set_crusher(TURN_OFF);

//         crusher_seq = 1;
//         setTimeout(crusher, 10);
//     }
//     else if(crusher_seq == 1) {
//         set_crusher(TURN_ON);

//         crusher_seq = 2;
//         setTimeout(crusher, 3*(60*1000));
//     }
//     else if(crusher_seq == 2) {
//         set_crusher(TURN_ON);
//         set_cleaning_pump(TURN_ON);

//         crusher_seq = 3;
//         setTimeout(crusher, 2*(60*1000));
//     }
//     else if(crusher_seq == 3) {
//         set_crusher(TURN_OFF);
//         set_cleaning_pump(TURN_OFF);

//         crusher_seq = 0;
//     }
// }

// var targeting_tick_count = 0;
// var cur_weight = 0.0;

// ///////////////////////////////////////////////////////////////////////////////

setTimeout(air_watchdog, 1000);

function air_watchdog(){
//     //100ms동작
//     //실시간으로 변경되는 상태값 저장

    co_timer = setTimeout(req_co, 1500);
//     input_door_timer = setTimeout(req_input_door, 250);
//     //output_door_timer = setTimeout(req_output_door, parseInt(Math.random()*10));
//     //safe_door_timer = setTimeout(req_safe_door, parseInt(Math.random()*10));
//     weight_timer = setTimeout(req_weight, 1500);
//     //operation_mode_timer = setTimeout(req_operation_mode, parseInt(Math.random()*10));
//     //debug_mode_timer = setTimeout(req_debug_mode, parseInt(Math.random()*10));
//     //start_btn_timer = setTimeout(req_start_btn, parseInt(Math.random()*10));

//     //console.log('food watchdog');
// }

var func = {};
func['res_co'] = res_co;
func['res_co2'] = res_co2;
func['res_tvoc'] = res_tvoc;
func['res_pm'] = res_pm;
// // func['res_output_door'] = res_output_door;
// // func['res_safe_door'] = res_safe_door;
// func['res_weight'] = res_weight;
// func['res_operation_mode'] = res_operation_mode;
// func['res_debug_mode'] = res_debug_mode;
// func['res_start_btn'] = res_start_btn;
