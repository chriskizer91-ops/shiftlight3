import sys, json, numpy as np, scipy.io.wavfile as wf, scipy.signal as ss, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
d=sys.argv[1]; ids=sys.argv[2].split(','); out=sys.argv[3]
fig,ax=plt.subplots(len(ids),1,figsize=(14,2.6*len(ids)),sharex=True)
for a,i in zip(ax,ids):
    sr,x=wf.read(f'{d}/{i}.wav'); x=x.astype(float).mean(1)/32767
    f,t,S=ss.spectrogram(x,sr,nperseg=2048,noverlap=1536)
    a.pcolormesh(t,f,10*np.log10(S+1e-12),vmin=-110,vmax=-35,shading='auto',cmap='magma'); a.set_ylim(0,5000); a.set_ylabel(i)
    tl=json.load(open(f'{d}/{i}.timeline.json')); tt=[r[0] for r in tl]; rp=[r[1] for r in tl]
    a2=a.twinx(); a2.plot(tt,rp,'c',lw=.8); a2.set_ylim(0,max(rp)*1.1)
plt.tight_layout(); plt.savefig(out,dpi=70)
