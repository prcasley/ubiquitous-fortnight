/**
 * Opt-in on-device NVIDIA Nemotron WebGPU worker.
 * Loads open-weight Nemotron 3 Nano 4B ONNX from Hugging Face on user click.
 * No API key, no hosted prompt processing, no private API, and no automatic downloads.
 * Model is not a source of verified property facts. Input must be limited to public facts.
 */
import {pipeline,env} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1";
const MODEL="onnx-community/NVIDIA-Nemotron-3-Nano-4B-BF16-ONNX";
env.allowRemoteModels=true;
env.useBrowserCache=true;
let generator=null,loading=false,generating=false;
const publish=(type,data={})=>self.postMessage({type,...data});
self.addEventListener("message",async e=>{
 const msg=e.data||{};
 if(msg.type==="load"){
   if(generator){publish("ready",{model:MODEL});return;}
   if(loading)return;
   loading=true;
   try{
     publish("status",{message:"Preparing Transformers.js WebGPU pipeline. First download may use multiple GB."});
     generator=await pipeline("text-generation",MODEL,{
       device:"webgpu",dtype:"q4",
       progress_callback:evt=>{
         if(evt&&evt.status==="progress"&&Number.isFinite(evt.progress)){
           publish("progress",{message:"Downloading Nemotron model files",percent:Math.max(0,Math.min(100,evt.progress))});
         }
         if(evt&&evt.status==="ready")publish("status",{message:"Model files loaded. Initializing GPU…"});
       }
     });
     publish("ready",{model:MODEL});
   }catch(ex){generator=null;publish("error",{message:"Nemotron model could not start: "+String(ex?.message||ex).slice(0,350)});}
   finally{loading=false;}
 }
 if(msg.type==="generate"){
   if(!generator){publish("error",{message:"Load the NVIDIA model first."});return;}
   if(generating){publish("error",{message:"A response is still generating."});return;}
   const prompt=typeof msg.prompt==="string"?msg.prompt.slice(0,11000):"";
   if(!prompt){publish("error",{message:"No verified parcel facts supplied."});return;}
   generating=true;
   try{
     const result=await generator(prompt,{
       max_new_tokens:320,do_sample:false,repetition_penalty:1.08
     });
     const output=result?.[0]?.generated_text;
     let answer=typeof output==="string"?output:JSON.stringify(output||"");
     if(answer.startsWith(prompt))answer=answer.slice(prompt.length);
     answer=answer.replace(/<think>[\s\S]*?<\/think>/gi,"").trim().slice(0,4200);
     if(!answer)throw Error("The model returned an empty answer");
     publish("answer",{answer,model:MODEL});
   }catch(ex){publish("error",{message:"NVIDIA local inference error: "+String(ex?.message||ex).slice(0,350)});}
   finally{generating=false;}
 }
});
