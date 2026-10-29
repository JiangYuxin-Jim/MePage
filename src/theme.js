function themePalette(accent){
 const channels=accent.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 const luminance=channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
 return {accent,ink:1.05/(luminance+0.05)>=(luminance+0.05)/0.05?'#ffffff':'#000000'};
}
module.exports={themePalette};
