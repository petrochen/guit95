// src/songs.ts — Per-song metadata for all 7 Guit95 songs.
// Paths correspond to the output of scripts/build-assets.sh.

export type SongMeta = {
  slug: string;
  title: string;
  artist: string;
  videoUrl: string;       // /assets/<slug>/<slug>.mp4
  rawDir: string;         // /assets/<slug>/raw/
  scoUrl: string;         // /assets/<slug>/raw/play/<sco>.sco
  chdUrl: string;         // /assets/<slug>/raw/chords/chords.chd
  chordImageUrl: string;  // /assets/<slug>/raw/chords/<picturefile>.png
  tabImageUrl: string;    // /assets/<slug>/raw/play/<scorefile>.png
  exerciseCount: number;  // real exercises only (folder 0 excluded)
  jingleUrl: string;      // /assets/jingles/<file>.wav
};

// Order matches the original CD title screen (TITLE1.TIT page 1 then TITLE2.TIT page 2).
export const SONGS: SongMeta[] = [
  {
    slug: "heyjoe",
    title: "Hey Joe",
    artist: "Jimi Hendrix",
    videoUrl: "/assets/heyjoe/heyjoe.mp4",
    rawDir: "/assets/heyjoe/raw/",
    scoUrl: "/assets/heyjoe/raw/play/hjoe.sco",
    chdUrl: "/assets/heyjoe/raw/chords/chords.chd",
    chordImageUrl: "/assets/heyjoe/raw/chords/heyjoe2.png",
    tabImageUrl: "/assets/heyjoe/raw/play/heyj-b2.png",
    exerciseCount: 16,
    jingleUrl: "/assets/jingles/jgl-jh01.wav",
  },
  {
    slug: "woman",
    title: "No Woman, No Cry",
    artist: "Bob Marley",
    videoUrl: "/assets/woman/woman.mp4",
    rawDir: "/assets/woman/raw/",
    scoUrl: "/assets/woman/raw/play/nwnc.sco",
    chdUrl: "/assets/woman/raw/chords/chords.chd",
    chordImageUrl: "/assets/woman/raw/chords/woman2.png",
    tabImageUrl: "/assets/woman/raw/play/nwnc-b2.png",
    exerciseCount: 13,
    jingleUrl: "/assets/jingles/jgl-bm01.wav",
  },
  {
    slug: "life",
    title: "Life by the Drop",
    artist: "Stevie Ray Vaughan",
    videoUrl: "/assets/life/life.mp4",
    rawDir: "/assets/life/raw/",
    scoUrl: "/assets/life/raw/play/life.sco",
    chdUrl: "/assets/life/raw/chords/chords.chd",
    chordImageUrl: "/assets/life/raw/chords/lbtd.png",
    tabImageUrl: "/assets/life/raw/play/lbtdbar3.png",
    exerciseCount: 7,
    jingleUrl: "/assets/jingles/jgl-rv01.wav",
  },
  {
    slug: "sweet",
    title: "Sweet Home Alabama",
    artist: "Lynyrd Skynyrd",
    videoUrl: "/assets/sweet/sweet.mp4",
    rawDir: "/assets/sweet/raw/",
    scoUrl: "/assets/sweet/raw/play/sha.sco",
    chdUrl: "/assets/sweet/raw/chords/chords.chd",
    chordImageUrl: "/assets/sweet/raw/chords/sha.png",
    tabImageUrl: "/assets/sweet/raw/play/sha-b4.png",
    exerciseCount: 12,
    jingleUrl: "/assets/jingles/jgl-ls01.wav",
  },
  {
    slug: "dust",
    title: "Dust in the Wind",
    artist: "Kansas",
    videoUrl: "/assets/dust/dust.mp4",
    rawDir: "/assets/dust/raw/",
    scoUrl: "/assets/dust/raw/play/ditw.sco",
    chdUrl: "/assets/dust/raw/chords/chords.chd",
    chordImageUrl: "/assets/dust/raw/chords/dust.png",
    tabImageUrl: "/assets/dust/raw/play/ditw-b2.png",
    exerciseCount: 9,
    jingleUrl: "/assets/jingles/jgl-ks01.wav",
  },
  {
    slug: "blowin",
    title: "Blowin' in the Wind",
    artist: "Bob Dylan",
    videoUrl: "/assets/blowin/blowin.mp4",
    rawDir: "/assets/blowin/raw/",
    scoUrl: "/assets/blowin/raw/play/bitw.sco",
    chdUrl: "/assets/blowin/raw/chords/chords.chd",
    chordImageUrl: "/assets/blowin/raw/chords/blowin.png",
    tabImageUrl: "/assets/blowin/raw/play/bitw-b2.png",
    exerciseCount: 7,
    jingleUrl: "/assets/jingles/jgl-bd01.wav",
  },
  {
    slug: "wild",
    title: "Wild World",
    artist: "Cat Stevens",
    videoUrl: "/assets/wild/wild.mp4",
    rawDir: "/assets/wild/raw/",
    scoUrl: "/assets/wild/raw/play/ww.sco",
    chdUrl: "/assets/wild/raw/chords/chords.chd",
    chordImageUrl: "/assets/wild/raw/chords/wild.png",
    tabImageUrl: "/assets/wild/raw/play/ww-b3.png",
    exerciseCount: 10,
    jingleUrl: "/assets/jingles/jgl-cs01.wav",
  },
];

export function getSongBySlug(slug: string): SongMeta | undefined {
  return SONGS.find((s) => s.slug === slug);
}
