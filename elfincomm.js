const fetch = require('node-fetch');
const AbortController = require('abort-controller');
const fs = require('fs');
const path = require('path');
const net = require('net');

const { networkInterfaces } = require('os');

const nets = networkInterfaces();



module.exports = function (_ip,_network,verbose)
{
    const port = 8081;
    //this.network = _network?_network:'192.168.1';
    this.ip = _ip?`http://${_ip}:${port}`:undefined;

    
    function getiplist()
    {
        var out = [];
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    out.push(net.address.substr(0, net.address.lastIndexOf(".")));
                }
            }
        }
        return out;
    }

    this.getip =  function()
    {
        return new Promise((resolve,reject)=> { 
            if (this.ip === undefined) {
                var network = [_network];
                if (_network === undefined) {
                    network = getiplist();
                }                
                this.findPrinter(network).then(v=>{resolve(v)}).catch(v=>reject(v))                
            } else {                      
                resolve (this.ip);
            }
        });
    }

    this._getjson = function(url) {
        return new Promise((resolve,reject)=> {
            this.getip().then(v=>{    
                if (verbose) console.info(`fetch ${this.ip}${url}`);                 
                fetch(`${this.ip}${url}`)
                .then(res => res.json())
                .then(json => resolve(json))
                .catch(e => reject(e.message));       
            }) 
        })
    }

    this._gettext = function(url) {
        return new Promise((resolve,reject)=>{
            this.getip().then(v=>{ 
                if (verbose) console.info(`fetch ${this.ip}${url}`); 
                fetch(`${this.ip}${url}`)
                .then(res => res.text())
                .then(text => resolve(text))
                .catch(e => reject(e.message));
            });        
        })
    }

    this.printerInfo = function() {
        return this._gettext('/setting/printerInfo');
    }

    this.currentVersion = function() {
        return this._gettext('/setting/currentVersion');
    }

    this.filelist = function() {
        return this._getjson('/file/list');
    }
    this.joblist = function() {
        return this._getjson('/job/list');
    }

    this.send = function (file) {
        return new Promise((resolve,reject)=>{
            try {
              
                if (verbose) console.info(`read ${file}`)
                var stats = fs.statSync(file);
                var fileSizeInBytes = stats.size;
                var readStream = fs.createReadStream(file);
                
                readStream.on('error',v=> {
                    reject(`can't read ${file}`);
                });
                
            }
            catch (e) {
                reject(`can't open ${file}`);                
                return;
            }
            this.getip().then(v=>{ 
                if (verbose) console.info(`fetch ${this.ip}/file/upload/${path.basename(file)}`);  
                fetch(`${this.ip}/file/upload/${path.basename(file)}`,{
                    method: 'POST',
                    headers: {
                        "Content-length": fileSizeInBytes
                },
                body: readStream
                })
                .then(res => res.json())
                .then(body => resolve(body))
                .catch(e => reject(e)); 
            });
        });
    }

    this.delete = function (file) {
        return this._getjson(`/file/delete/${file}`);
    }

    this.print = function (file) {
        return this._getjson(`/file/print/${file}`);
    }

    this.stop = function (id) {
        return this._getjson(`/job/stop/${id}`);
    }

    this.toggle = function (id) {
        return this._getjson(`/job/toggle/${id}`);
    }

    function checkStatus(response) {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        return response;
      }

    this.getImg = function(id) {
        return new Promise((resolve,reject)=>{
            this.getip().then(v=>{ 
                if (verbose) console.info(`fetch ${this.ip}/job/getImg/${id}`);
                fetch(`${this.ip}/job/getImg/${id}`)
                .then(res => checkStatus(res) && res.arrayBuffer())
                .then(buffer => {resolve(buffer)})
                .catch(e => reject(e));        
            });
        })
    }

    this.getCurrentJob = function() {
        return new Promise((resolve,reject)=> {
            this.joblist()
            .then(json=> {
                var id = null;
                for (i of json) {
                    if (i.printInProgress) {
                        id = i.id;
                    }
                }
                resolve(id);
            })
            .catch(e => reject(e)); 
        });
    }

    this.getCurrentImg = function() {
        return new Promise((resolve,reject)=> {
            this.getCurrentJob()
            .then(job=>{
                if (job) {
                    this.getImg(job)
                    .then(img=>resolve(img))
                    .catch(e => reject(e));
                } else {
                    resolve(null)
                }

            })
            .catch(e => reject(e));
        });
    }

    this.currentJobStop = function() {
        return new Promise((resolve,reject)=> {
            this.getCurrentJob()
            .then(job=>{
                if (job) {
                    this.stop(job)
                    .then(json=>resolve(json))
                    .catch(e => reject(e));
                } else {
                    resolve(null)
                }

            })
            .catch(e => reject(e));
        });
    }

    this.currentJobToggle = function() {
        return new Promise((resolve,reject)=> {
            this.getCurrentJob()
            .then(job=>{
                if (job) {
                    this.toggle(job)
                    .then(json=>resolve(json))
                    .catch(e => reject(e));
                } else {
                    resolve(null)
                }

            })
            .catch(e => reject(e));
        });
    }

    this.findPrinter = function(basearray)
    {
        return new Promise((resolve,reject)=> {
            socketlist = [];
            var found = false;
            for (base of basearray) {
                if (found) {
                    break;
                }
                if (verbose) console.info(`Search printer on network ${base}.x:${port}`);
                var ip = 254; //IP address to start with on a C class network

                const controller = new AbortController();

                var fetchcount = 0;
                var connectcount = 0;
                
                function checkConnect (obj) {
                    ip--;
                    var thisIP = `${base}.${ip}`; //concatenate to a real IP address

                    var S = new net.Socket();
                    socketlist.push(S);
                    connectcount++;
                    S.connect(port, thisIP);

                    if(ip > 0 && !found) { checkConnect(obj); }

                    S.on('connect',  ()=> {
                        connectcount--;
                        fetchcount++;
                        if (verbose) console.info(`fetch http://${thisIP}:${port}/setting/printerInfo`)
                        fetch(`http://${thisIP}:${port}/setting/printerInfo`,{signal:controller.signal})
                        .then(res => res.text())
                        .then(text => {
                            fetchcount--;
                            found = true;                   
                            for (var i of socketlist) {
                                i.destroy();
                            } 
                            controller.abort();
                            obj.ip = `http://${thisIP}:${port}`;
                            if (verbose) console.info(`find elfin at ${obj.ip}`);
                            resolve(obj.ip);                
                        })
                        .catch(e=>{
                            fetchcount--;
                            if (fetchcount === 0 && connectcount === 0) {
                                reject();
                            }
                        });
                    });  
                    S.on('error',()=>{
                        connectcount--;
                        if (fetchcount === 0 && connectcount === 0) {
                            reject('no printer found');
                        }
                    });         
                    S.end();
                };
                checkConnect(this);
            }
        });
    }
}

/*
GET /printer/move/0.05 HTTP/1.1    or     GET /printer/move/-0.05 HTTP/1.1        +-0.05 1 10 50
Host: 192.168.2.64:8081
Content-type: application/x-www-form-urlencoded
Connection: Keep-Alive
Accept-Encoding: gzip, deflate
Accept-Language: en-US,*
User-Agent: Mozilla/5.0

HTTP/1.0 200 OK
Access-Control-Allow-Origin: *
Content-Type: application/json
Content-Length: 53
Connection: close

{"command":"move","message":"ok\r\n","response":true}











*/