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

global.my_parent_cnt_name = '';
global.my_cnt_name = '';
global.air_parent_mission_name = '';
global.air_mission_name = '';
global.my_sortie_name = 'disarm';

const normal_interval = 100;
const retry_interval = 2500;
var data_interval = 2000;

var app = express();

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
        // mqtt_connect(conf.cse.host, noti_topic);
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
            // console.log(res_body);
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
        // console.log(msg_obj);
        if(msg_obj.hasOwnProperty('val10')) {
            func[topic.replace('/', '')](msg_obj.val, msg_obj.val2, msg_obj.val3, msg_obj.val4, msg_obj.val5, msg_obj.val6, msg_obj.val7, msg_obj.val8, msg_obj.val9, msg_obj.val10);
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
        // console.log(air_mqtt_client);

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

// ///////////////////////////////////////////////////////////////////////////////
setTimeout(air_watchdog, 1000);

function air_watchdog(){
//     //100ms동작
//     //실시간으로 변경되는 상태값 저장
    // console.log('run air_watchdog');
    co_timer = setTimeout(req_co, 1500);
    co2_timer = setTimeout(req_co2, 1500);
    tvoc_timer = setTimeout(req_tvoc, 1500);
    pm_timer = setTimeout(req_pm, 1500);
//     input_door_timer = setTimeout(req_input_door, 250);
//     //output_door_timer = setTimeout(req_output_door, parseInt(Math.random()*10));
//     //safe_door_timer = setTimeout(req_safe_door, parseInt(Math.random()*10));
//     weight_timer = setTimeout(req_weight, 1500);
//     //operation_mode_timer = setTimeout(req_operation_mode, parseInt(Math.random()*10));
//     //debug_mode_timer = setTimeout(req_debug_mode, parseInt(Math.random()*10));
//     //start_btn_timer = setTimeout(req_start_btn, parseInt(Math.random()*10));

    console.log('air_watchdog');
}

var func = {};
func['res_co'] = res_co;
func['res_co2'] = res_co2;
func['res_tvoc'] = res_tvoc;
func['res_pm'] = res_pm;
// func['res_output_door'] = res_output_door;
// func['res_safe_door'] = res_safe_door;
// func['res_weight'] = res_weight;
// func['res_operation_mode'] = res_operation_mode;
// func['res_debug_mode'] = res_debug_mode;
// func['res_start_btn'] = res_start_btn;