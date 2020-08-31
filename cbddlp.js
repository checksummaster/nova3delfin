// https://github.com/cbiffle/catibo/blob/master/doc/cbddlp-ctb.adoc


var jbinary = require('jbinary');
var jdataview = require('jdataview');
var fs = require('fs');
var PNG = require("pngjs").PNG;
const {U64, I64} = require('n64');

var verbose=true;
var skiplayer = true;

const asciify = require("asciify-pixel-matrix");

module.exports = function () {

    this.check = function(filename) {
        try {
            var cbddlp = fs.readFileSync(filename);
        } catch {
            return null;
        }
        var data = new jbinary(new jdataview(cbddlp,0,cbddlp.length,true));
        var magic = data.read('uint32').toString(16);
        if (magic === "12fd0019") return "cbddlp"
        else if (magic === "12fd0086") return "ctb"
        else return null;
    }

    this.read = function(filename) {
        try {
            var cbddlp = fs.readFileSync(filename);
        } catch {
            return null;
        }

        var data = new jbinary(new jdataview(cbddlp,0,cbddlp.length,true));

        function swap32(val) {
            return ((val & 0xFF) << 24)
                | ((val & 0xFF00) << 8)
                | ((val >> 8) & 0xFF00)
                | ((val >> 24) & 0xFF);
        }

        function swap16(val) {
            return ((val & 0xFF) << 8)
                | ((val >> 8) & 0xFF);
        }

        var header = data.read({
        
            magic:'uint32',
            version:'uint32',
            printer_out_mm: {
                x:'float',
                y:'float',
                z:'float'
            },
            zero:'uint64',
            overall_height_mm:'float',
            layer_height_mm:'float',
            exposure_s:'float',
            bot_exposure_s:'float',

            light_off_time_s:'float',

            bot_layer_count:'uint32',
            resolution:{
                x:'uint32',
                y:'uint32'
            },
            large_preview_offset:'uint32',

            layer_table_offset:'uint32',
            layer_table_count:'uint32',
            small_preview_offset:'uint32',
            print_time_s:'uint32',
            projection:'uint32',
            ext_config_offset:'uint32',

            ext_config_size:'uint32',
            level_set_count:'uint32',
            pwm_level:'uint16',
            bot_pwm_level:'uint16',
            encryption_key:'uint32',
            ext_config2_offset:'uint32',
            ext_config2_size:'uint32'
        },0);
        header.magic = header.magic.toString(16);
        delete header.zero;

        var ext_config = data.read({
            bot_lift_dist_mm:'float',
            bot_lift_speed_mmpm:'float',
            lift_dist_mm:'float',
            lift_speed_mmpm:'float',


            retract_speed_mmpm:'float',
            resin_volume_ml:'float',
            resin_mass_g:'float',
            resin_cost:'float',
            
            bot_light_off_time_s:'float',
            light_off_time_s:'float',
            bot_layer_count:'uint32',    
        },header.ext_config_offset);
        delete header.ext_config_offset;
        delete header.ext_config_size;

        var ext_config2 = data.read({
            //zero:['array','uint32',7],
            machine_type_offset:'uint32', 

            machine_type_len:'uint32', 
            encryption_mode:'uint32', 
            mysterious_id:'uint32', 
            antialias_level:'uint32', 

            software_version:'uint32', 
            //unknown0x200:'uint32'

        },header.ext_config2_offset+4*7);
        delete header.ext_config2_offset;
        delete header.ext_config2_size;

        function readimage(data,offset) {
            var  ret = data.read({
                width:'uint32',
                height:'uint32',
                offset:'uint32',
                len:'uint32'
            },offset);    
            

            var t = data.read(['array',['uint16',true],ret.len/2],ret.offset);
            var buffer = [];
            for (var i = 0; i< t.length; i++) {
                
                var a = t[i];
                var b = ((a>>0) & 31)*8;
                var run =  (a>>5) & 1;
                var g = ((a>>6) & 31)*8;
                var r =   ((a>>11) & 31)*8;
                buffer.push(r);buffer.push(g);buffer.push(b);
                if (run === 1) {
                    i++;
                    var size = t[i]&0x0FFF;
                    while(size--) {
                        buffer.push(r);buffer.push(g);buffer.push(b);
                    }
                }
            }

            ret.buffer = buffer;

        
            delete ret.offset;
            delete ret.len;
            return ret;
        }

        function readimageMono(data,offset,length,width,height) {  
            var buffer = new Buffer.alloc(width*height);
            var c = 0;
            for (var i = 0; i< length; i++) {
                
                var a = data.view.buffer[i+offset];
                var v = ((a>>7) & 1);
                var run =  a & 0x7F;

                while(run--) {
                    buffer[c++] = v;
                }
            }
            return buffer;
        }

        function uint64_mult(a,b)
        {
            var a64 = U64(a);
            var b64 = U64(b);
            var c64 = a64.mul(b64);
            return c64.lo >>> 0;
        }

        function uint64_add(a,b)
        {
            var a64 = U64(a);
            var b64 = U64(b);
            var c64 = a64.add(b64);
            return c64.lo >>> 0;
        }

        function readimagectb(data,offset,length,width,height,pub) {  
            var buffer = new Buffer.alloc(width*height);
            var c = 0;



            

            if (header.encryption_key) {

            
                var kstart = uint64_add(uint64_mult(header.encryption_key , 0x2d83cdac), 0xd8a83423) ;
                var key = uint64_mult(uint64_add(uint64_mult(pub , 0x1e1530cd) , 0xec3d47cd) ,kstart) ;

                var index = 0;
                for (var i = 0; i < length ; i++ ) {
                    var k = (key >> (8 * index)) & 0xFF;
                    index++;
                    if ((index & 3) == 0)
                    {
                        key = uint64_add(key , kstart);
                        Index = 0;
                    }
                    data.view.buffer[i+offset] = data.view.buffer[i+offset] ^ k;
                }
            }

            for (var i = 0; i< length; i++) {
                if (c >= width*height) {
                    console.log(i);
                    break;
                }
                var a = data.view.buffer[i+offset];
                var v = (a & 0x7F)<<1;
                var run = 1;
                if (a & 0x80) {
                    var t = data.view.buffer[i+offset+1];
                    if (!(t&0x80)) {
                        run = t&0x7F;
                        i += 1;
                    } else if (!(t&0x40)) { 
                        run = t&0x3F; 
                        run = (run << 8) + data.view.buffer[i+offset+2];
                        i += 2;
                    } else if (!(t&0x20)) {
                        run = t&0x1F;
                        run = (run << 8) + data.view.buffer[i+offset+2];
                        run = (run << 8) + data.view.buffer[i+offset+3];
                        i += 3;           
                    } else if (!(t&0x10)) {
                        run = t&0x0F;
                        run = (run << 8) + data.view.buffer[i+offset+2];
                        run = (run << 8) + data.view.buffer[i+offset+3];
                        run = (run << 8) + data.view.buffer[i+offset+4];
                        i += 4; 
                    } 
                }

                while(run--) {
                    buffer[c++] = v;
                }
            }
            return buffer;
        }

        var small_preview = readimage(data,header.small_preview_offset);
        delete header.small_preview_offset;

        var large_preview = readimage(data,header.large_preview_offset);
        delete header.large_preview_offset;
        var layer = [];

        if (!skiplayer) {
            if (header.magic === "12fd0019" ) {
                var layer_table = data.read(['array',{z:"float",exposure_s:"float",light_off_time_s:"float",data_offset:'uint32',data_len:'uint32',zero:['array','uint32',4]},header.layer_table_count*header.level_set_count],header.layer_table_offset);
                for (var i = 0; i < header.layer_table_count; i++) {
                    if (verbose) console.log(`Read layer ${i+1}`);
                    var buf;
                    for (var pass=0; pass <header.level_set_count; pass++) {
                        passoffset = pass * header.layer_table_count;
                        var s = readimageMono(data,layer_table[passoffset+i].data_offset,layer_table[passoffset+i].data_len,header.resolution.x,header.resolution.y);
                        if (pass ===0) {
                            buf = s;
                        } else {
                            for (var j = 0;j<buf.length;j++) {
                                buf[j] =buf[j] *2+s[j] 
                            }
                        }
                    }
                    for (var j = 0;j<buf.length;j++) {
                        buf[j] = buf[j] << (8-header.level_set_count); // All the way to 8bits data
                    }
                    layer[i] = buf;

                    break;
                }
            } else {
                var layer_table = data.read(['array',{z:"float",exposure_s:"float",light_off_time_s:"float",data_offset:'uint32',data_len:'uint32',zero:['array','uint32',4]},header.layer_table_count],header.layer_table_offset);
                for (var i = 0; i < header.layer_table_count; i++) {
                    if (verbose) console.log(`Read layer ${i+1}`);
                    layer[i] = readimagectb(data,layer_table[i].data_offset,layer_table[i].data_len,header.resolution.x,header.resolution.y,i);
                }
            }
        }

        delete header.layer_table_count;
        delete header.layer_table_offset;



        return {header,ext_config,ext_config2,small_preview,large_preview,layer}
         
    }

    this.convert = function(filename) {
        var data = this.read(filename);
        var gcodeheader = `
; nova3d.cn NovaMaker v2.4.20 64-bits 2020-08-11 01:35:34
;(****Build and Slicing Parameters****)
;(Pix per mm X            = 19.324 )
;(Pix per mm Y            = 19.324 )
;(X Resolution            = 1352 )
;(Y Resolution            = 2512 )
;(Layer Thickness         = 0.03500 mm )
;(Layer Time              = 7000 ms )
;(Render Outlines         = False
;(Outline Width Inset     = 2
;(Outline Width Outset    = 0
;(Bottom Layers Time      = 45000 ms )
;(Number of Bottom Layers = 5 )
;(Blanking Layer Time     = 0 ms )
;(Build Direction         = Bottom_Up)
;(Lift Distance           = 4 mm )
;(Slide/Tilt Value        = 0)
;(Use Mainlift GCode Tab  = False)
;(Anti Aliasing           = True)
;(Anti Aliasing Value     = 2.0 )
;(Z Lift Feed Rate        = 120.0 mm/s )
;(Z Bottom Lift Feed Rate = 120.0 mm/s )
;(Z Lift Retract Rate     = 120.0 mm/s )
;(Flip X                  = True)
;(Flip Y                  = True)
;Number of Slices         = 429
;(****Machine Configuration ******)  
;(Platform X Size         = 65.02mm )
;(Platform Y Size         = 116mm )  
;(Platform Z Size         = 130mm )  
;(Max X Feedrate          = 200mm/s )
;(Max Y Feedrate          = 200mm/s )
;(Max Z Feedrate          = 200mm/s )
;(Machine Type            = UV_LCD)              
`
        
    }
}

function ascii(data,width,height,mono,textwidth)
{
    var color = [];
    var step = Math.ceil(width/textwidth);
    for (var y = 0 ; y < height; y+=step) {
        var line = [];
        var offset = y * width * (mono?1:3);
        for (var x = 0 ; x < width; x+=step) {
            if (mono) {
                line.push({
                    r:data[offset+x],
                    g:data[offset+x],
                    b:data[offset+x]
                })
            }
            line.push({
                r:data[offset+x*3],
                g:data[offset+x*3+1],
                b:data[offset+x*3+2]
            })
        }
        color.push(line);
    }
    return asciify(color);
}

function test()
{
    var o = new module.exports ();
    console.log (o.check('data/test.cbddlp'));
    console.log (o.check('data/test.ctb'));
    console.log (o.check('../data/test.cbddlp'));
    console.log (o.check('../data/test.ctb'));

    var data = o.read('data/test.ctb');
    if (data === null) {
        data = o.read('../data/test.ctb');
    }
    if (data) {
        console.log(ascii(data.large_preview.buffer,data.large_preview.width,data.large_preview.height,false,80));
    
        
        

    /*    console.log(`save preview_cropping.png`)
        let png = new PNG({
            width:  data.large_preview.width,
            height: data.large_preview.height,
        });
        
        png.data = data.large_preview.buffer;

        fs.writeFileSync(`preview_cropping.png`,PNG.sync.write(png,{
            inputColorType :2
        }));


        for (var i = 0; i< data.layer.length ; i++) {
            console.log(`save layer_${(i+1).toString().padStart(5, "0")}.png`)
            let png = new PNG({
                width: data.header.resolution.x,
                height: data.header.resolution.y,
                bitDepth: 8,
                colorType: 0,
                inputColorType:0,
                inputHasAlpha: false,
            });
            
            png.data = data.layer[i];

            fs.writeFileSync(`layer_${(i+1).toString().padStart(5, "0")}.png`,PNG.sync.write(png,{
                inputColorType:0
            }));
            break;
        }

        */
        delete data.small_preview
        delete data.large_preview
        delete data.layer
        console.log(JSON.stringify(data,null,2));
    }
}

test();



