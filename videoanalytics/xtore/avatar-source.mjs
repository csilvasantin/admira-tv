// Decode an operator-selected raster locally. No request, storage or image URL.
export async function readAvatarPhoto(file,{decode=blob=>createImageBitmap(blob),canvas=()=>document.createElement('canvas')}={}){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||!Number.isFinite(file.size)||file.size<=0||file.size>8*1024*1024)throw new Error('photo-format');
  let bitmap,surface;
  try{
    bitmap=await decode(file);
    const {width,height}=bitmap;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>24_000_000)throw new Error('photo-size');
    const scale=Math.min(1,1024/Math.max(width,height));
    surface=canvas();surface.width=Math.max(2,Math.round(width*scale));surface.height=Math.max(2,Math.round(height*scale));
    const context=surface.getContext('2d');context.drawImage(bitmap,0,0,surface.width,surface.height);
    return context.getImageData(0,0,surface.width,surface.height);
  }finally{bitmap?.close();if(surface){surface.width=1;surface.height=1;}}
}
