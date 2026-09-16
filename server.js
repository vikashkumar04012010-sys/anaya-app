// server.js — Anaya backend
// Keeps the OpenAI API key on the server. The frontend never sees it.
require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const { ANAYA_SYSTEM_PROMPT, buildMemoryBlock } = require('./persona');

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const MAX_HISTORY_MESSAGES = 20;

if (!process.env.OPENAI_API_KEY) console.warn('\n[Anaya] WARNING: OPENAI_API_KEY is not set. Add it to backend/.env.\n');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(m => m && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim() }));
}
function extractMemoryTag(text) {
  const match=text.match(/<memories>([\s\S]*?)<\/memories>/i);
  if(!match) return {reply:text.trim(),newMemories:[]};
  const reply=text.replace(match[0],'').trim();
  const facts=match[1].split('\n').map(x=>x.replace(/^[-*]\s*/,'').trim()).filter(x=>x && x.length<200).slice(0,2);
  return {reply,newMemories:facts};
}

app.post('/api/chat', async (req,res)=>{
  try {
    const {message,history,memories,oldSummary,playfulness}=req.body||{};
    if(!message || typeof message!=='string' || !message.trim()) return res.status(400).json({error:'empty_message',friendly:"You didn't actually send anything 👀"});
    if(message.length>4000) return res.status(400).json({error:'message_too_long',friendly:"That's a lot 😅 can you shorten it a bit?"});
    const memoryBlock=buildMemoryBlock(memories,oldSummary);
    const toneNote=Number(playfulness)>=2?'Lean a little more playful and teasing than usual.':Number(playfulness)<=0?'Keep the tone calm and understated.':'Use your normal balanced personality.';
    const response=await openai.responses.create({
      model:MODEL,
      instructions:`${ANAYA_SYSTEM_PROMPT}\n\n${toneNote}\n\n${memoryBlock}`,
      input:[...sanitizeHistory(history),{role:'user',content:message.trim()}],
      max_output_tokens:700,
      store:false
    });
    const raw=(response.output_text||'').trim();
    const {reply,newMemories}=extractMemoryTag(raw);
    res.json({reply:reply||'hmm, I got a bit tongue-tied there 😭 say that again?',newMemories});
  } catch(err) {
    console.error('[Anaya] /api/chat error:',err?.status||'',err?.message||err);
    if(err?.status===401) return res.status(500).json({error:'bad_api_key',friendly:"I can't reach my brain right now — the server's API key needs fixing 😬"});
    if(err?.status===429) return res.status(429).json({error:'rate_limited',friendly:'Whoa, too many messages at once 😅 give me a second.'});
    res.status(500).json({error:'server_error',friendly:'Ugh, something broke on my end. Try again in a moment?'});
  }
});

app.post('/api/summarize',async(req,res)=>{
  try{
    const {messages,previousSummary}=req.body||{};
    const chunk=sanitizeHistory(messages);
    if(!chunk.length) return res.json({summary:previousSummary||''});
    const transcript=chunk.map(m=>`${m.role==='user'?'User':'Anaya'}: ${m.content}`).join('\n');
    const response=await openai.responses.create({
      model:MODEL,
      instructions:'Compress the supplied chat transcript into a short factual summary (3-5 sentences). Use third person, plain prose, no headers. Keep useful facts, topics and emotionally significant context; omit pleasantries.',
      input:`${previousSummary?`Existing summary:\n${previousSummary}\n\n`:''}New transcript:\n${transcript}\n\nWrite the updated combined summary.`,
      max_output_tokens:200,
      store:false
    });
    res.json({summary:(response.output_text||previousSummary||'').trim()});
  }catch(err){console.error('[Anaya] summarize error:',err?.message||err);res.json({summary:req.body?.previousSummary||''});}
});
app.get('/health',(req,res)=>res.json({ok:true,model:MODEL}));
app.listen(PORT,()=>console.log(`[Anaya] server running on http://localhost:${PORT}`));
