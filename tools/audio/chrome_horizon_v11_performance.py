#!/usr/bin/env python3
import argparse, json, math, random, struct
from pathlib import Path

BPM=152
PPQ=480
BEAT=PPQ
BAR=4*PPQ
KS={"sus":19,"mute":22,"slide_up":24,"pull":25,"hammer":26,"slide_in":27,"bend":92}

P={
 "Em":[(0,64,.78,88,"sus"),(1.15,67,.52,84,"hammer"),(2.05,71,1.48,104,"bend")],
 "C":[(0,64,.70,87,"sus"),(1.08,67,.52,84,"slide_in"),(2.02,72,1.50,105,"bend")],
 "Bm":[(0,66,.56,82,"mute"),(1.05,69,.54,86,"hammer"),(2.02,74,1.44,106,"bend")],
 "Am":[(0,69,.68,88,"sus"),(1.08,72,.50,85,"hammer"),(2.02,67,.90,97,"pull"),(3.22,64,.46,79,"mute")],
}
DEV={
 "Em":[(0,64,.52,82,"mute"),(.86,67,.38,83,"hammer"),(1.38,71,.70,94,"sus"),(2.42,74,.38,91,"slide_up"),(3.02,71,.64,104,"bend")],
 "C":[(0,64,.56,87,"sus"),(.86,67,.38,83,"hammer"),(1.38,72,.72,96,"sus"),(2.40,71,.34,86,"pull"),(3.00,67,.66,103,"bend")],
 "Bm":[(0,66,.50,81,"mute"),(.84,69,.38,84,"hammer"),(1.36,74,.72,97,"sus"),(2.38,72,.34,86,"pull"),(3.00,71,.66,104,"bend")],
 "Am":[(0,69,.54,88,"sus"),(.86,72,.36,84,"hammer"),(1.38,76,.72,108,"bend"),(2.48,72,.32,86,"pull"),(3.00,67,.64,95,"sus")],
}
LIFT={
 "Em":[(0,64,.48,81,"mute"),(.72,67,.32,84,"hammer"),(1.18,71,.52,91,"slide_up"),(2.02,76,1.28,111,"bend")],
 "C":[(0,67,.50,89,"sus"),(.72,71,.32,85,"hammer"),(1.18,72,.52,92,"slide_up"),(2.02,76,1.28,112,"bend")],
 "Bm":[(0,66,.48,81,"mute"),(.72,69,.32,85,"hammer"),(1.18,74,.54,94,"slide_up"),(2.02,79,1.25,114,"bend")],
 "Am":[(0,69,.50,89,"sus"),(.72,72,.32,86,"hammer"),(1.18,76,.62,110,"bend"),(2.25,74,.32,87,"pull"),(2.80,71,.76,98,"sus")],
}
CLIMAX={
 "Em":[(0,64,.44,82,"mute"),(.60,67,.28,86,"hammer"),(1.00,71,.48,96,"slide_up"),(1.66,76,1.08,118,"bend"),(3.12,74,.28,89,"pull")],
 "C":[(0,67,.44,91,"sus"),(.60,71,.28,87,"hammer"),(1.00,72,.48,97,"slide_up"),(1.66,76,1.08,119,"bend"),(3.12,74,.28,89,"pull")],
 "Bm":[(0,66,.42,82,"mute"),(.58,69,.28,87,"hammer"),(.98,74,.48,99,"slide_up"),(1.64,79,1.04,122,"bend"),(3.08,76,.28,91,"pull")],
 "Am":[(0,69,.42,92,"sus"),(.58,72,.28,88,"hammer"),(.98,76,.54,114,"bend"),(1.92,74,.24,91,"pull"),(2.30,72,.22,88,"pull"),(2.66,71,.22,86,"pull"),(3.08,67,.48,99,"sus")],
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
        vib=7 if art not in ("bend","sus") else (20 if art=="sus" else (34 if stage!="climax" else 50))
        cc(tick-18,20,vib); cc(tick-18,21,53+rng.randint(-4,5))
        cc(tick-18,22,84 if art=="mute" else 43+rng.randint(-5,5))
        cc(tick-18,24,60 if art=="mute" else 78); cc(tick-18,25,70 if art=="mute" else 92)
        if art=="bend":
            cc(tick-18,28,70 if stage in ("seed","development") else 54)
            cc(tick-18,52,46 if stage!="climax" else 38)
            cc(tick-18,53,62 if stage!="climax" else 80)
        cc(tick-18,46,{"seed":60,"development":67,"lift":75,"climax":85}[stage]+rng.randint(-3,3))
        cc(tick-18,29,{"seed":66,"development":72,"lift":79,"climax":86}[stage]+rng.randint(-3,3))
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
