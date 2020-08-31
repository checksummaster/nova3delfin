
require('console-info');
require('console-warn');
require('console-error');
var elfincomm = require('./elfincomm');

const fs = require('fs');

const commander  = require('commander');
const { fstat } = require('fs');
var program = new commander.Command();


async function  start() 
{
    try {
        var lib = new elfincomm(program.ip,program.network,program.verbose);
        await lib.getip();
    } catch(e) {
        console.error(e);
        return undefined;        
    }
    return lib;
}

program
    .version('0.0.1', '-v, --vers', 'output the current version')
    .option('-j, --json','output in json format')
    .option('-f, --full','output all data') 
    .option('--ip <type>','ip of printer')
    .option('-n, --network <type>','network mask to find printer')  
    .option('--verbose','display more informations') 
    .option('--retry','image function retry until success')  

program
    .command('info')
    .description('get info from printer')
    .action(async () => {
        var lib = await start();
        console.log(`url            ${await lib.getip()}`);      
        console.log(`printerInfo    ${await lib.printerInfo()}`);
        console.log(`currentVersion ${await lib.currentVersion()}`);  
    });

program
    .command('file')
    .description('list files on the elfin printer')
    .action(async () => {
        try {
            var lib = await start();
            if (lib) {
                if (program.json) {
                    console.log(await lib.filelist());
                } else {
                    console.table(await lib.filelist())
                }
            }
        } catch(e) {
            console.error(e);
        }
    });

program
    .command('job')
    .description('list job on the elfin printer')    
    .action(async () => {
        var lib = await start()
        if (lib) {
            try {
                var data = await lib.joblist();
                if (!program.full) {
                data = data.map(v=>{return {
                        jobName:v.jobName,
                        id:v.id,
                        status:v.status,
                        errorDescription:v.errorDescription
                    }});
                }
                if (program.json) {
                    console.log(data);
                } else {
                    console.table(data)
                }        
            } catch(e) {
                console.error(e);
            }
        }
    });

program
    .command('currentjob')
    .description('Get the current active job')    
    .action(async () => {
        var lib = await start()
        if (lib) { 
            try {
                var currentjob = await lib.getCurrentJob();
                var data = (await lib.joblist()).filter(v=>v.id === currentjob);
                
                if (!program.full) {
                data = data.map(v=>{return {
                        jobName:v.jobName,
                        id:v.id,
                        status:v.status,
                        errorDescription:v.errorDescription
                    }});
                }
                if (program.json) {
                    console.log(data);
                } else {
                    console.table(data)
                }        
            } catch(e) {
                console.error(e);
            }
        }
    });

    program
    .command('status')
    .description('Status of current print')    
    .action(async () => {
        var lib = await start()
        if (lib) { 
            do {
                try {
                    var currentjob = await lib.getCurrentJob();
                    var data = (await lib.joblist()).filter(v=>v.id === currentjob);
                    if (data.length) {
                        var time = (data[0].totalSlices-data[0].currentSlice) * data[0].lastNAverageSliceTime;
                        console.log(`Slices ${data[0].currentSlice}/${data[0].totalSlices} pause: ${data[0].printPaused?"yes":'no'} remaining time ${new Date(time).toISOString().substr(11, 8)}`)
                    } else {
                        console.log('seem nothing printing now');
                    }
                } catch(e) {
                    console.error(e);
                }
            } while(program.retry);
            
        }
    });

program
    .command('image [filename]')
    .description('get current image (if it exist)')
    .action(async () => {
        console.log(program.args[1])
        var lib = await start()
        if (lib) {
            do {
                try {
                    var data = await lib.getCurrentImg();
                    if (data) { 
                        if (program.args[1]) {               
                            fs.writeFileSync(program.args[1],Buffer.from(data));
                            console.log(`image saved in ${program.args[1]}`);
                        }
                        break
                    } else {
                        console.log("no image");
                    }
                } catch(e) {
                    console.log(e);
                }
            } while(program.retry)
        }
    });

program
    .command('send <filename>')
    .description('send a file to printer')
    .action(async () => {
        var lib = await start()
        if (lib) {
            try {
                var r = await lib.send(program.args[1]); 
                console.log(`${r.response?'success':'fail'}`);
                if (program.verbose) console.info(r);        
            } catch(e) {
                console.error(e);
            }
        }
    });

program
    .command('delete <filename>')
    .description('delete a file on the printer')
    .action(async () => {        
        var lib = await start()
        if (lib) {
            try {
                var r = await lib.delete(program.args[1]);
                console.log(`${r.response?'success':'fail'}`); 
                if (program.verbose) console.info(r);        
            } catch(e) {
                console.error(e);
            }    
        }
    });

program
    .command('print <filename>')
    .description('print a file that is already on the printer')
    .action(async () => {        
        var lib = await start()
        if (lib) {
            try {
                var r = await lib.print(program.args[1]);
                console.log(`${(r.status==='ready' || r.status==='Printing')?'success':'fail'}`);//TODO test ??
                if (program.verbose) console.info(r);          
            } catch(e) {
                console.error(e);
            }
        }
    });

program.parse(process.argv);


/*
async function main() {
    try {
        //var lib = new elfincomm('http://192.168.2.64:8081');
        //console.log(await lib.printerInfo());
        //console.log(await lib.currentVersion());
        //console.log(await lib.filelist());
        //console.log(await lib.joblist());
        //console.log(await lib.send('test.cws'));
        //console.log(await lib.delete('test.cws'));
        //console.log(await lib.getCurrentJob());
        //console.log(await lib.getCurrentImg());
        //console.log(await lib.getImg('9f283389-c041-46d0-84ac-2f8156d8d2df'));
        //lib.findPrinter('192.168.2').then(v=>console.log(v)).catch(e=>console.log(e));

        
        lib.findPrinter('192.168.2').then( add=>{


//            console.log(`url ${add}`);
//            lib.printerInfo().then(v=>{console.log(`printerInfo ${v}`)})
//            lib.currentVersion().then(v=>{console.log(`currentVersion ${v}`)})
        })
        
    } catch(e) {
        console.log(e);
        process.exit();
    }
}

main();
*/

