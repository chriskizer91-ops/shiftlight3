/* =====================================================================================
   GL — a thin layer over WebGL2: programs with #defines and named uniforms, textures,
   render targets, vertex arrays. Uniform values come from plain objects so a whole frame's
   worth of shared values (camera, lights, weather) can be applied to any program at once.
   ===================================================================================== */
export function createGL(canvas){
  const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,depth:false,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  if(!gl)throw new Error('This game needs WebGL2.');
  const ext={
    /* every render target is 16-bit float, so phones that only offer the half-float extension work too */
    cbf:gl.getExtension('EXT_color_buffer_float')||gl.getExtension('EXT_color_buffer_half_float'),
    flt:gl.getExtension('OES_texture_float_linear'),
    aniso:gl.getExtension('EXT_texture_filter_anisotropic'),
    timer:gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    par:gl.getExtension('KHR_parallel_shader_compile')
  };
  if(!ext.cbf)throw new Error('This game needs floating-point render targets (EXT_color_buffer_float or EXT_color_buffer_half_float).');
  const G={gl,ext,maxAniso:ext.aniso?gl.getParameter(ext.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT):1};

  /* ---------- programs ---------- */
  const SAMPLER_TYPES=new Set([gl.SAMPLER_2D,gl.SAMPLER_3D,gl.SAMPLER_CUBE,gl.SAMPLER_2D_SHADOW,gl.SAMPLER_2D_ARRAY,gl.SAMPLER_2D_ARRAY_SHADOW,gl.SAMPLER_CUBE_SHADOW,
    gl.INT_SAMPLER_2D,gl.UNSIGNED_INT_SAMPLER_2D,gl.INT_SAMPLER_3D,gl.UNSIGNED_INT_SAMPLER_3D,gl.INT_SAMPLER_2D_ARRAY,gl.UNSIGNED_INT_SAMPLER_2D_ARRAY]);
  const header=defs=>'#version 300 es\nprecision highp float;precision highp int;precision highp sampler2DArray;precision highp sampler2DShadow;precision highp sampler2DArrayShadow;precision highp usampler2D;precision highp samplerCube;\n'+
    Object.entries(defs||{}).map(([k,v])=>`#define ${k} ${v===true?'':v}`).join('\n')+'\n';
  /* compile now, link lazily so the browser can compile many programs in parallel */
  G.programs=[];
  G.program=(name,vs,fs,defs={})=>{
    const P={name,p:gl.createProgram(),u:{},samplers:{},ready:false};G.programs.push(P);
    const mk=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,header(defs)+src);gl.compileShader(s);gl.attachShader(P.p,s);return s;};
    P.vs=mk(gl.VERTEX_SHADER,vs);P.fs=mk(gl.FRAGMENT_SHADER,fs);P.srcV=vs;P.srcF=fs;P.defs=defs;
    gl.linkProgram(P.p);
    return P;
  };
  G.finish=P=>{
    if(P.ready)return P;
    if(!gl.getProgramParameter(P.p,gl.LINK_STATUS)){
      for(const [s,src] of [[P.vs,P.srcV],[P.fs,P.srcF]])if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
        const log=gl.getShaderInfoLog(s),hdr=header(P.defs).split('\n').length-1;
        const m=/ERROR: \d+:(\d+)/.exec(log||''),ln=m?+m[1]-hdr:-1,lines=src.split('\n');
        console.error(`[${P.name}] `+log+(ln>0?'\n'+lines.slice(Math.max(0,ln-4),ln+2).map((l,i)=>(Math.max(1,ln-3)+i)+': '+l).join('\n'):''));
        throw new Error(`shader ${P.name}: ${log}`);}
      throw new Error(`link ${P.name}: ${gl.getProgramInfoLog(P.p)}`);
    }
    const n=gl.getProgramParameter(P.p,gl.ACTIVE_UNIFORMS);let unit=0;
    gl.useProgram(P.p);
    for(let i=0;i<n;i++){const inf=gl.getActiveUniform(P.p,i),nm=inf.name.replace(/\[0\]$/,''),loc=gl.getUniformLocation(P.p,inf.name);
      if(SAMPLER_TYPES.has(inf.type)){P.samplers[nm]=unit;gl.uniform1i(loc,unit);unit++;}
      else P.u[nm]={loc,type:inf.type,size:inf.size};}
    P.ready=true;return P;
  };
  /* wait for every program to finish compiling without blocking the page (KHR_parallel_shader_compile) */
  G.warmup=async(onProgress)=>{
    const par=ext.par,list=G.programs.filter(P=>!P.ready);const t0=performance.now();
    if(par){while(true){const done=list.filter(P=>gl.getProgramParameter(P.p,par.COMPLETION_STATUS_KHR)).length;onProgress&&onProgress(done,list.length);
      if(done===list.length||performance.now()-t0>60000)break;await new Promise(r=>setTimeout(r,30));}}
    for(let i=0;i<list.length;i++){G.finish(list[i]);if(!par){onProgress&&onProgress(i+1,list.length);await new Promise(r=>setTimeout(r,0));}}
  };
  let cur=null;
  G.use=P=>{if(!P.ready)G.finish(P);if(cur!==P){gl.useProgram(P.p);cur=P;}return P;};
  /* set every uniform this program has from a dictionary of values */
  G.set=(P,vals)=>{
    for(const k in P.u){const v=vals[k];if(v===undefined)continue;setU(P.u[k],v);}
  };
  G.uni=(P,k,v)=>{const u=P.u[k];if(u)setU(u,v);};
  function setU(u,v){
    const l=u.loc;
    switch(u.type){
      case gl.FLOAT:if(u.size>1)gl.uniform1fv(l,v);else gl.uniform1f(l,v);break;
      case gl.FLOAT_VEC2:gl.uniform2fv(l,v);break;
      case gl.FLOAT_VEC3:gl.uniform3fv(l,v);break;
      case gl.FLOAT_VEC4:gl.uniform4fv(l,v);break;
      case gl.INT:case gl.BOOL:if(u.size>1)gl.uniform1iv(l,v);else gl.uniform1i(l,v);break;
      case gl.INT_VEC2:gl.uniform2iv(l,v);break;
      case gl.UNSIGNED_INT:gl.uniform1ui(l,v);break;
      case gl.FLOAT_MAT4:gl.uniformMatrix4fv(l,false,v);break;
      case gl.FLOAT_MAT3:gl.uniformMatrix3fv(l,false,v);break;
    }
  }
  /* bind textures by sampler name: {uName: texture} */
  G.tex=(P,map)=>{for(const k in map){const unit=P.samplers[k];if(unit===undefined)continue;const t=map[k];gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(t.target||gl.TEXTURE_2D,t.t||t);}};

  /* ---------- textures and targets ---------- */
  const FMT={
    rgba8:[gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE],srgb8:[gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE],
    rgba16f:[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT],rg16f:[gl.RG16F,gl.RG,gl.HALF_FLOAT],r16f:[gl.R16F,gl.RED,gl.HALF_FLOAT],
    r11g11b10f:[gl.R11F_G11F_B10F,gl.RGB,gl.HALF_FLOAT],
    rgba32f:[gl.RGBA32F,gl.RGBA,gl.FLOAT],r32f:[gl.R32F,gl.RED,gl.FLOAT],rg32f:[gl.RG32F,gl.RG,gl.FLOAT],
    r8:[gl.R8,gl.RED,gl.UNSIGNED_BYTE],rg8:[gl.RG8,gl.RG,gl.UNSIGNED_BYTE],
    r16ui:[gl.R16UI,gl.RED_INTEGER,gl.UNSIGNED_SHORT],rg16ui:[gl.RG16UI,gl.RG_INTEGER,gl.UNSIGNED_SHORT],rgba16ui:[gl.RGBA16UI,gl.RGBA_INTEGER,gl.UNSIGNED_SHORT],
    r32ui:[gl.R32UI,gl.RED_INTEGER,gl.UNSIGNED_INT],rg32ui:[gl.RG32UI,gl.RG_INTEGER,gl.UNSIGNED_INT],
    depth32f:[gl.DEPTH_COMPONENT32F,gl.DEPTH_COMPONENT,gl.FLOAT],depth24:[gl.DEPTH_COMPONENT24,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT]
  };
  G.FMT=FMT;
  G.texture=(w,h,fmt='rgba8',o={})=>{
    const [ifmt,f,ty]=FMT[fmt],t=gl.createTexture(),target=o.cube?gl.TEXTURE_CUBE_MAP:o.layers?gl.TEXTURE_2D_ARRAY:gl.TEXTURE_2D;
    gl.bindTexture(target,t);
    const lv=o.mips?Math.floor(Math.log2(Math.max(w,h)))+1:1;
    if(o.layers)gl.texStorage3D(target,lv,ifmt,w,h,o.layers);else gl.texStorage2D(target,lv,ifmt,w,h);
    const lin=o.filter!=='nearest';
    gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,o.mips?(lin?gl.LINEAR_MIPMAP_LINEAR:gl.NEAREST_MIPMAP_NEAREST):(lin?gl.LINEAR:gl.NEAREST));
    gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,lin?gl.LINEAR:gl.NEAREST);
    const wr=o.wrap==='repeat'?gl.REPEAT:o.wrap==='mirror'?gl.MIRRORED_REPEAT:gl.CLAMP_TO_EDGE;
    gl.texParameteri(target,gl.TEXTURE_WRAP_S,wr);gl.texParameteri(target,gl.TEXTURE_WRAP_T,wr);if(o.cube||o.layers)gl.texParameteri(target,gl.TEXTURE_WRAP_R,wr);
    if(o.compare){gl.texParameteri(target,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.texParameteri(target,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);}
    if(o.aniso&&ext.aniso)gl.texParameterf(target,ext.aniso.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(o.aniso,G.maxAniso));
    if(o.data&&!o.layers&&!o.cube)gl.texSubImage2D(target,0,0,0,w,h,f,ty,o.data);
    if(o.data&&o.mips)gl.generateMipmap(target);
    return {t,target,w,h,fmt,ifmt,f,ty,levels:lv};
  };
  G.upload=(T,data,x=0,y=0,w=T.w,h=T.h)=>{gl.bindTexture(T.target,T.t);gl.texSubImage2D(T.target,0,x,y,w,h,T.f,T.ty,data);};
  G.del=T=>{if(T&&T.t)gl.deleteTexture(T.t);};
  /* a framebuffer over color attachments (textures, or {tex, layer, face, level}) and an optional depth texture */
  G.target=(colors,depth)=>{
    const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
    const att=a=>a&&a.tex?a:{tex:a};
    const bufs=[];
    (colors||[]).forEach((c,i)=>{const A=att(c);bindAtt(gl.COLOR_ATTACHMENT0+i,A);bufs.push(gl.COLOR_ATTACHMENT0+i);});
    if(depth)bindAtt(gl.DEPTH_ATTACHMENT,att(depth));
    gl.drawBuffers(bufs.length?bufs:[gl.NONE]);if(!bufs.length)gl.readBuffer(gl.NONE);
    const st=gl.checkFramebufferStatus(gl.FRAMEBUFFER);if(st!==gl.FRAMEBUFFER_COMPLETE)throw new Error('framebuffer incomplete 0x'+st.toString(16));
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    const c0=colors&&colors[0]?att(colors[0]):att(depth);
    const lvl=c0.level||0;
    return {fb,w:Math.max(1,c0.tex.w>>lvl),h:Math.max(1,c0.tex.h>>lvl),n:bufs.length,bufs};
  };
  function bindAtt(point,A){
    const T=A.tex,lvl=A.level||0;
    if(T.target===gl.TEXTURE_CUBE_MAP)gl.framebufferTexture2D(gl.FRAMEBUFFER,point,gl.TEXTURE_CUBE_MAP_POSITIVE_X+(A.face||0),T.t,lvl);
    else if(T.target===gl.TEXTURE_2D_ARRAY)gl.framebufferTextureLayer(gl.FRAMEBUFFER,point,T.t,lvl,A.layer||0);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER,point,gl.TEXTURE_2D,T.t,lvl);
  }
  G.bind=(R,vp)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,R?R.fb:null);if(vp)gl.viewport(vp[0],vp[1],vp[2],vp[3]);else if(R)gl.viewport(0,0,R.w,R.h);};
  G.delTarget=R=>{if(R)gl.deleteFramebuffer(R.fb);};

  /* ---------- geometry ---------- */
  /* layout: [{name, size, type:'f32'|'i16n'|'u8n'|'u8i', offset}], stride in bytes */
  G.mesh=(layout,stride,vbData,ibData,P)=>{
    const vao=gl.createVertexArray();gl.bindVertexArray(vao);
    const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,vbData,gl.STATIC_DRAW);
    for(const a of layout){
      const loc=a.loc;gl.enableVertexAttribArray(loc);
      if(a.type==='f32')gl.vertexAttribPointer(loc,a.size,gl.FLOAT,false,stride,a.offset);
      else if(a.type==='i16n')gl.vertexAttribPointer(loc,a.size,gl.SHORT,true,stride,a.offset);
      else if(a.type==='u8n')gl.vertexAttribPointer(loc,a.size,gl.UNSIGNED_BYTE,true,stride,a.offset);
      else if(a.type==='u8i')gl.vertexAttribIPointer(loc,a.size,gl.UNSIGNED_BYTE,stride,a.offset);
      else if(a.type==='u16i')gl.vertexAttribIPointer(loc,a.size,gl.UNSIGNED_SHORT,stride,a.offset);
    }
    let ib=null,count=vbData.byteLength/stride,itype=0;
    if(ibData){ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,ibData,gl.STATIC_DRAW);count=ibData.length;itype=ibData instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;}
    gl.bindVertexArray(null);
    return {vao,vb,ib,count,itype};
  };
  G.draw=(M,first=0,count=M.count,mode=gl.TRIANGLES)=>{gl.bindVertexArray(M.vao);if(M.ib)gl.drawElements(mode,count,M.itype,first*(M.itype===gl.UNSIGNED_INT?4:2));else gl.drawArrays(mode,first,count);};
  G.drawInst=(M,n,mode=gl.TRIANGLES)=>{gl.bindVertexArray(M.vao);if(M.ib)gl.drawElementsInstanced(mode,M.count,M.itype,0,n);else gl.drawArraysInstanced(mode,0,M.count,n);};
  /* the empty VAO for full-screen triangles and procedural instancing */
  G.empty=gl.createVertexArray();
  G.fullscreen=()=>{gl.bindVertexArray(G.empty);gl.drawArrays(gl.TRIANGLES,0,3);};
  G.procedural=(verts,inst,mode=gl.TRIANGLES)=>{gl.bindVertexArray(G.empty);if(inst>1)gl.drawArraysInstanced(mode,0,verts,inst);else gl.drawArrays(mode,0,verts);};
  /* GPU timer, when the extension exists (it measures the frame's GPU time for resolution scaling) */
  G.timer=()=>{
    if(!ext.timer)return null;const qs=[];let last=-1;
    return {begin(){const q=gl.createQuery();gl.beginQuery(ext.timer.TIME_ELAPSED_EXT,q);qs.push(q);},end(){gl.endQuery(ext.timer.TIME_ELAPSED_EXT);},
      poll(){const dis=gl.getParameter(ext.timer.GPU_DISJOINT_EXT);while(qs.length&&gl.getQueryParameter(qs[0],gl.QUERY_RESULT_AVAILABLE)){const q=qs.shift();if(!dis)last=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);}
        while(qs.length>6)gl.deleteQuery(qs.shift());return last;}};
  };
  return G;
}

/* ---------- matrices (column-major Float32Array(16), as GL wants them) ---------- */
export const M4={
  ident(){const m=new Float32Array(16);m[0]=m[5]=m[10]=m[15]=1;return m;},
  mul(a,b,o=new Float32Array(16)){
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;},
  /* reversed-Z infinite perspective is tempting, but keep a standard one: near/far explicit */
  persp(fovy,asp,n,f,o=new Float32Array(16)){const t=1/Math.tan(fovy/2);o.fill(0);o[0]=t/asp;o[5]=t;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o;},
  ortho(l,r,b,t,n,f,o=new Float32Array(16)){o.fill(0);o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);o[15]=1;return o;},
  /* view matrix from an eye position and a camera basis (right, up, back) */
  view(eye,R,U,B,o=new Float32Array(16)){
    o[0]=R[0];o[4]=R[1];o[8]=R[2];o[12]=-(R[0]*eye[0]+R[1]*eye[1]+R[2]*eye[2]);
    o[1]=U[0];o[5]=U[1];o[9]=U[2];o[13]=-(U[0]*eye[0]+U[1]*eye[1]+U[2]*eye[2]);
    o[2]=B[0];o[6]=B[1];o[10]=B[2];o[14]=-(B[0]*eye[0]+B[1]*eye[1]+B[2]*eye[2]);
    o[3]=0;o[7]=0;o[11]=0;o[15]=1;return o;},
  lookAt(eye,at,up=[0,1,0],o){
    let b=[eye[0]-at[0],eye[1]-at[1],eye[2]-at[2]];const bl=Math.hypot(...b)||1;b=b.map(x=>x/bl);
    let r=[up[1]*b[2]-up[2]*b[1],up[2]*b[0]-up[0]*b[2],up[0]*b[1]-up[1]*b[0]];const rl=Math.hypot(...r)||1;r=r.map(x=>x/rl);
    const u=[b[1]*r[2]-b[2]*r[1],b[2]*r[0]-b[0]*r[2],b[0]*r[1]-b[1]*r[0]];
    return M4.view(eye,r,u,b,o);},
  /* model matrix from a row-major 3x3 rotation (columns = body axes) and a position */
  fromRot(R,p,o=new Float32Array(16)){
    o[0]=R[0];o[1]=R[3];o[2]=R[6];o[3]=0;o[4]=R[1];o[5]=R[4];o[6]=R[7];o[7]=0;o[8]=R[2];o[9]=R[5];o[10]=R[8];o[11]=0;o[12]=p[0];o[13]=p[1];o[14]=p[2];o[15]=1;return o;},
  invert(m,o=new Float32Array(16)){
    const a=m,b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5],b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],
      b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12],b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14];
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(!det)return M4.ident();det=1/det;
    o[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*det;o[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*det;o[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*det;o[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*det;
    o[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*det;o[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*det;o[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*det;o[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*det;
    o[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*det;o[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*det;o[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*det;o[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*det;
    o[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*det;o[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*det;o[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*det;o[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*det;
    return o;},
  xform(m,p){const w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return [(m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12])/w,(m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13])/w,(m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14])/w];},
  /* the six frustum planes of a view-projection matrix, as [a,b,c,d] with inside = a*x+b*y+c*z+d >= 0 */
  planes(m){const P=[],r=i=>[m[i],m[4+i],m[8+i],m[12+i]];const r0=r(0),r1=r(1),r2=r(2),r3=r(3);
    for(const [s,q] of [[1,r0],[-1,r0],[1,r1],[-1,r1],[1,r2],[-1,r2]]){const p=[r3[0]+s*q[0],r3[1]+s*q[1],r3[2]+s*q[2],r3[3]+s*q[3]],l=Math.hypot(p[0],p[1],p[2]);P.push(p.map(x=>x/l));}return P;},
  /* does an axis-aligned box touch the frustum? */
  boxVisible(P,mn,mx){for(const p of P){const x=p[0]>0?mx[0]:mn[0],y=p[1]>0?mx[1]:mn[1],z=p[2]>0?mx[2]:mn[2];if(p[0]*x+p[1]*y+p[2]*z+p[3]<0)return false;}return true;}
};
