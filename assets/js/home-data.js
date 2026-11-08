import { getSupabaseClient, getBeijingDate } from './supabase.js';

const client = () => getSupabaseClient();
export const CONFLICT = '另一位刚刚修改了这条内容。你的输入已保留，请先查看最新内容，再决定如何保存。';
const media = new Map();

export async function loadHome() {
  const results = await Promise.all([
    client().from('home_date').select('*').eq('id',true).single(),
    client().from('home_items').select('*').order('created_at',{ascending:false}).order('id'),
    client().from('home_photos').select('*').order('created_at',{ascending:false}).order('id'),
    client().from('home_frame').select('*').eq('id',true).single(),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return {date:results[0].data, items:results[1].data, photos:results[2].data, frame:results[3].data};
}

export async function updateVersioned(table, id, version, patch) {
  const {data,error} = await client().from(table).update(patch).eq('id',id).eq('version',version).select().maybeSingle();
  if(error) throw error;
  if(!data) throw new Error(CONFLICT);
  return data;
}

export async function saveItem(item, patch) {
  if(item) return updateVersioned('home_items', item.id, item.version, patch);
  const {data,error} = await client().from('home_items').insert(patch).select().single();
  if(error) {
    if(patch.id) {
      const {data:existing,error:lookupError}=await client().from('home_items').select('*').eq('id',patch.id).maybeSingle();
      if(!lookupError && existing) return existing;
    }
    throw error;
  }
  return data;
}

export async function deleteItem(item) {
  const {data,error} = await client().from('home_items').delete().eq('id',item.id).eq('version',item.version).select().maybeSingle();
  if(error) throw error;
  if(!data) throw new Error(CONFLICT);
  if(item.image_path) await removeMedia(item.image_path);
}

export async function mediaUrl(path) {
  if(!path) return '';
  if(media.has(path)) return media.get(path);
  const promise = (async () => {
    const {data,error} = await client().storage.from('home-photos').download(path);
    if(error) {media.delete(path);throw error;}
    return URL.createObjectURL(data);
  })();
  media.set(path,promise);
  return promise;
}

export async function clearMedia() {
  const old = [...media.values()];
  media.clear();
  for(const value of old) {try {URL.revokeObjectURL(await value);} catch {}}
}

export async function preparePhoto(file) {
  if(!file || file.size > 25 * 1024 * 1024) throw new Error('请选择 25 MB 以内的照片。');
  if(!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  let bitmap;
  try {bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});}
  catch {throw new Error('这张照片暂时无法读取，请换成 JPG、PNG 或 WebP 格式。');}
  const scale = Math.min(1, 2000 / Math.max(bitmap.width,bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1,Math.round(bitmap.width*scale));
  canvas.height = Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
  if(!blob || blob.size>8*1024*1024) throw new Error('照片处理后仍然太大，请换一张小一点的照片。');
  return blob;
}

export async function uploadMedia(file, userId) {
  const blob=await preparePhoto(file);
  const path=`${userId}/${crypto.randomUUID()}.jpg`;
  const {error}=await client().storage.from('home-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});
  if(error) throw error;
  return path;
}

export async function removeMedia(path) {
  const {error}=await client().storage.from('home-photos').remove([path]);
  if(error) throw new Error('记录已移除，但照片文件清理失败。请稍后重试清理。');
  if(media.has(path)) {try {URL.revokeObjectURL(await media.get(path));} catch {} media.delete(path);}
}

export async function addPhoto(file,userId) {
  const path=await uploadMedia(file,userId);
  const {data,error}=await client().rpc('register_home_photo',{photo_path:path,photo_title:''});
  if(error) {
    // A lost response may follow a committed insert. Check before deleting/retrying.
    const {data:existing,error:lookupError}=await client().from('home_photos').select('*').eq('path',path).maybeSingle();
    if(existing) return existing;
    if(!lookupError) await removeMedia(path).catch(()=>{});
    throw error;
  }
  return data;
}

export async function deletePhoto(photo) {
  const {data:path,error}=await client().rpc('remove_home_photo',{target_id:photo.id});
  if(error) throw error;
  if(path) {
    try {await removeMedia(path);} catch(error) {error.cleanupPath=path;throw error;}
  }
}

export function appointmentSummary(record, today=getBeijingDate()) {
  if(!record?.date) return {day:'?',text:'下次哪天见？',active:false};
  if(record.date<today) return {day:'♡',text:'约好下一次见面',active:false};
  const [year,month,day]=record.date.split('-').map(Number);
  const week=new Intl.DateTimeFormat('zh-CN',{weekday:'short',timeZone:'Asia/Shanghai'}).format(new Date(Date.UTC(year,month-1,day,4)));
  const when=record.date===today?'今天':`${month}月${day}日 ${week}`;
  return {day:String(day),text:`${when}${record.time?` ${record.time.slice(0,5)}`:''} 见`,active:true};
}

// The couple confirmed 231 days on 2026-11-08 (Beijing calendar day).
export function togetherDays(today=getBeijingDate()) {
  const baseline=Date.parse('2026-11-08T00:00:00Z');
  const current=Date.parse(`${today}T00:00:00Z`);
  return Math.max(0,231+Math.round((current-baseline)/86400000));
}
