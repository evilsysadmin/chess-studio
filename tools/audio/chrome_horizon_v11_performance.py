#!/usr/bin/env python3
import argparse, json, math, random, struct
from pathlib import Path

BPM=152
PPQ=480
BEAT=PPQ
BAR=4*PPQ
KS={"sus":19,"mute":22,"slide_up":24,"pull":25,"hammer":26,"slide_in":27,"bend":92}

P={
 # Semilla: tres/cuatro notas, dirección muy evidente.
 "Em":[(0.00,64,.72,88,"sus"),(1.15,67,.52,84,"hammer"),(2.18,71,1.28,103,"sus")],
 "C":[(0.00,76,.72,96,"sus"),(1.08,72,.52,88,"pull"),(2.02,71,.46,85,"pull"),(2.86,67,.82,98,"sus")],
 "Bm":[(0.00,66,.62,82,"mute"),(1.05,69,.50,86,"hammer"),(1.92,71,.48,91,"hammer"),(2.78,74,.88,104,"sus")],
 "Am":[(0.00,76,.68,99,"sus"),(1.00,72,.50,88,"pull"),(1.88,69,.48,85,"pull"),(2.76,67,.82,94,"sus")],
}
DEV={
 # Desarrollo: mismo oleaje con un paso de enlace y resolución más cantable.
 "Em":[(0.00,64,.58,84,"mute"),(.88,67,.42,85,"hammer"),(1.56,71,.54,94,"hammer"),(2.34,76,.92,108,"sus"),(3.48,71,.34,88,"pull")],
 "C":[(0.00,76,.62,101,"sus"),(.92,72,.44,91,"pull"),(1.62,71,.40,87,"pull"),(2.28,67,.54,90,"pull"),(3.10,64,.62,97,"sus")],
 "Bm":[(0.00,66,.56,82,"mute"),(.86,69,.42,86,"hammer"),(1.52,71,.42,91,"hammer"),(2.18,74,.90,106,"sus"),(3.36,71,.36,90,"pull")],
 "Am":[(0.00,76,.60,103,"sus"),(.90,72,.42,91,"pull"),(1.56,69,.42,87,"pull"),(2.24,67,.54,89,"pull"),(3.08,64,.64,96,"sus")],
}
LIFT={
 # Elevación: mismo dibujo, cima más larga y más abierta.
 "Em":[(0.00,64,.54,84,"mute"),(.78,67,.38,87,"hammer"),(1.34,71,.48,96,"hammer"),(2.02,76,1.34,114,"sus")],
 "C":[(0.00,76,.66,106,"sus"),(.92,72,.42,94,"pull"),(1.56,71,.38,89,"pull"),(2.14,67,.46,91,"pull"),(2.88,64,.76,101,"sus")],
 "Bm":[(0.00,66,.52,83,"mute"),(.76,69,.38,88,"hammer"),(1.32,71,.42,94,"hammer"),(1.94,74,1.30,111,"sus")],
 "Am":[(0.00,76,.64,107,"sus"),(.90,72,.40,94,"pull"),(1.52,69,.38,89,"pull"),(2.10,67,.44,91,"pull"),(2.82,64,.80,101,"sus")],
}
CLIMAX={
 # Clímax: ola completa. Más amplitud, no más velocidad.
 "Em":[(0.00,64,.48,84,"mute"),(.68,67,.34,89,"hammer"),(1.16,71,.42,99,"hammer"),(1.76,76,.94,119,"sus"),(2.94,74,.34,94,"pull"),(3.42,71,.38,91,"pull")],
 "C":[(0.00,76,.56,111,"sus"),(.76,72,.36,98,"pull"),(1.30,71,.34,92,"pull"),(1.80,67,.42,94,"pull"),(2.42,64,.72,104,"sus"),(3.38,67,.32,91,"hammer")],
 "Bm":[(0.00,66,.46,84,"mute"),(.66,69,.34,90,"hammer"),(1.14,71,.38,97,"hammer"),(1.70,74,.90,116,"sus"),(2.86,72,.32,94,"pull"),(3.32,69,.42,91,"pull")],
 "Am":[(0.00,76,.54,111,"sus"),(.74,72,.36,98,"pull"),(1.28,69,.34,92,"pull"),(1.78,67,.42,94,"pull"),(2.38,64,.70,104,"sus"),(3.34,67,.32,91,"hammer")],
}
STAGES=[("seed",P,12,1),("development",DEV,20,1),("lift",LIFT,28,1),("climax",CLIMAX,36,3)]
PROG=["Em","C","Bm","Am"]

def vlq(n):
    out=[n&0x7f]; n>>=7
    while n:
        out.append((n&0x7f)|0x80); n>>=7
    return bytes(reversed(out))

def build_midi(path, seed, timing_ms, velocity_bias, xtrack):
    rng=random.Random(seed)
    ev=[]
    def add(t,o,d): ev.append((max(0,int(t)),o,bytes(d)))
    tempo=round(60_000_000/BPM)
    add(0,0,b"\xff\x51\x03"+tempo.to_bytes(3,"big"))
    add(0,1,bytes([0xB0,7,116])); add(0,1,bytes([0xB0,11,112]))
    defaults={20:10,21:58,22:54,23:72,24:70,25:86,28:56,29:76,30:72,31:60,46:69,48:64,52:58,53:66}
    for cc,val in defaults.items(): add(0,1,bytes([0xB0,cc,val]))
    def cc(t,n,v): add(t,0,bytes([0xB0,n,max(0,min(127,int(v)))]))
    def keyswitch(t,n):
        add(t-22,0,bytes([0x90,n,100])); add(t-6,0,bytes([0x80,n,0]))
    def play(tick,n,dur_b,vel,art,stage):
        keyswitch(tick,KS[art])
        pick={"mute":40,"hammer":51,"pull":48,"slide_up":56,"slide_in":56,"sus":70,"bend":78}[art]
        pick += rng.randint(-5,5) + (4 if stage=="climax" else 0)
        cc(tick-18,30,pick); cc(tick-18,31,58+rng.randint(-10,10))
        vib=3 if art not in ("bend","sus") else (8 if art=="sus" else (16 if stage!="climax" else 22))
        cc(tick-18,20,vib); cc(tick-18,21,53+rng.randint(-4,5))
        cc(tick-18,22,84 if art=="mute" else 43+rng.randint(-5,5))
        cc(tick-18,24,60 if art=="mute" else 78); cc(tick-18,25,70 if art=="mute" else 92)
        if art=="bend":
            cc(tick-18,28,82 if stage in ("seed","development") else 74)
            cc(tick-18,52,66 if stage!="climax" else 58)
            cc(tick-18,53,50 if stage!="climax" else 58)
        cc(tick-18,46,{"seed":60,"development":66,"lift":72,"climax":78}[stage]+rng.randint(-3,3))
        cc(tick-18,29,{"seed":66,"development":70,"lift":75,"climax":79}[stage]+rng.randint(-3,3))
        cc(tick-18,23,96 if dur_b>=.9 else 60)
        jitter=round((timing_ms/1000)*(BPM/60)*PPQ*rng.uniform(-1,1))
        if xtrack:
            jitter += round((.003+rng.uniform(-.002,.005))*(BPM/60)*PPQ)
        vv=max(1,min(127,vel+velocity_bias+rng.randint(-4,4)))
        dur=round(dur_b*BEAT*rng.uniform(.965,1.035))
        add(tick+jitter,2,bytes([0x90,n,vv])); add(tick+jitter+max(30,dur),1,bytes([0x80,n,0]))
    for stage,patterns,start_bar,reps in STAGES:
        for rep in range(reps):
            phrase_gain=rng.randint(-2,2)
            for i,key in enumerate(PROG):
                bar=start_bar+rep*4+i
                bar_offset=round((rng.uniform(-.004,.004)+(0.010 if stage=="seed" else 0))*(BPM/60)*PPQ)
                for pos,n,dur_b,vel,art in patterns[key]:
                    play(bar*BAR+round(pos*BEAT)+bar_offset,n,dur_b,vel+phrase_gain,art,stage)
    ev.sort(key=lambda x:(x[0],x[1]))
    tr=bytearray(); last=0
    for t,_,d in ev:
        tr+=vlq(t-last)+d; last=t
    tr+=b"\x00\xff\x2f\x00"
    Path(path).write_bytes(b"MThd"+struct.pack(">IHHH",6,0,1,PPQ)+b"MTrk"+struct.pack(">I",len(tr))+tr)

def reamp(folder):
    import numpy as np, soundfile as sf, torch
    from scipy.signal import butter, sosfilt, fftconvolve
    from nam.models import init_from_nam
    f=Path(folder); SR=48000
    def read(path):
        x,sr=sf.read(path,dtype="float32",always_2d=False)
        if x.ndim>1:x=x.mean(axis=1)
        assert sr==SR
        return x.astype(np.float32)
    L=read(f/"left-di.wav"); R=read(f/"right-di.wav"); ir=read(f/"cab-ir.wav")
    nz=np.where(np.abs(ir)>max(1e-7,float(np.max(np.abs(ir)))*1e-4))[0]
    if len(nz):ir=ir[max(0,int(nz[0])-8):]
    ir=ir[:min(len(ir),int(.25*SR))]; ir/=np.max(np.abs(ir))+1e-12
    hp=butter(2,72/(SR/2),btype="highpass",output="sos"); lp=butter(2,11200/(SR/2),btype="lowpass",output="sos")
    def load(path):
        cfg=json.loads(Path(path).read_text()); m=init_from_nam(cfg); m.eval()
        if m.sample_rate is None:m.sample_rate=SR
        assert int(round(m.sample_rate))==SR
        return m
    def level(x,tdb):
        rms=float(np.sqrt(np.mean(x*x)+1e-12)); target=10**(tdb/20)
        return (x*min(8,target/max(rms,1e-8))).astype(np.float32)
    def infer(m,x):
        rf=int(m.receptive_field); out=[]; pos=0
        with torch.inference_mode():
            while pos<len(x):
                end=min(len(x),pos+131072); cur=x[pos:end]
                if pos==0:y=m(torch.from_numpy(cur.copy()),pad_start=True)
                else:
                    hist=x[max(0,pos-rf+1):pos]
                    if len(hist)<rf-1:hist=np.pad(hist,(rf-1-len(hist),0))
                    y=m(torch.from_numpy(np.concatenate([hist,cur]).astype(np.float32)),pad_start=False)
                out.append(y.detach().cpu().numpy().astype(np.float32)); pos=end
        return np.concatenate(out)
    def cab(x):
        y=fftconvolve(x,ir,mode="full")[:len(x)].astype(np.float32)
        return sosfilt(lp,sosfilt(hp,y)).astype(np.float32)
    yl=cab(infer(load(f/"jcm2000.nam"),level(L,-22)))
    yr=cab(infer(load(f/"5150.nam"),level(R,-24)))
    n=min(len(yl),len(yr)); st=np.column_stack([yl[:n]*.97,yr[:n]*.91])
    pk=float(np.max(np.abs(st)))+1e-12
    if pk>.82:st*=.82/pk
    sf.write(f/"guitar-performance-raw.wav",st,SR,subtype="PCM_24")

def main():
    ap=argparse.ArgumentParser(); sub=ap.add_subparsers(dest="cmd",required=True)
    p=sub.add_parser("midi"); p.add_argument("folder")
    p=sub.add_parser("reamp"); p.add_argument("folder")
    a=ap.parse_args(); f=Path(a.folder); f.mkdir(parents=True,exist_ok=True)
    if a.cmd=="midi":
        build_midi(f/"performance-left.mid",20260921,4.0,0,False)
        build_midi(f/"performance-right.mid",20260922,7.5,-5,True)
    else: reamp(f)

if __name__=="__main__": main()
