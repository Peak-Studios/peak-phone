/** GTA V world coordinates, not geographic latitude/longitude.
 * Atlas and projection match the same pinned open-source map distribution.
 * See THIRD_PARTY_NOTICES.md for provenance and tools/vendor-atlas.py for offline use.
 */
export const MAP_CONFIG=Object.freeze({
 tileTemplate:'https://raw.githubusercontent.com/SToXiT/gta-v-map-leaflet_-fire_borne/00e4c30b797aa3993435664769a905c14224a1a2/mapStyles/styleAtlas/{z}/{x}/{y}.jpg',
 // For fully offline use, run tools/vendor-atlas.py, then use this template:
 // tileTemplate:'./duo/map-atlas/{z}/{x}/{y}.jpg',
 minZoom:0,maxZoom:5,tileSize:256,
 projection:{centerX:117.3,centerY:172.8,scaleX:0.02072,scaleY:0.0205},
 attribution:'Atlas · GTA V Map Leaflet / RiceaRaul & SToXiT',
 pollMilliseconds:1200,
 // Add server-specific points here; coordinates must be real GTA V world coordinates.
 places:[
  {id:'legion',name:'Legion Square',area:'Downtown',category:'Landmarks',x:215.8,y:-810.1},
  {id:'pillbox',name:'Pillbox Medical',area:'Textile City',category:'Services',x:307.2,y:-595.3},
  {id:'missionrow',name:'Mission Row Police',area:'Mission Row',category:'Services',x:425.1,y:-979.5},
  {id:'airport',name:'Los Santos Airport',area:'LSIA',category:'Travel',x:-1037.7,y:-2737.8},
  {id:'delperro',name:'Del Perro Pier',area:'Del Perro',category:'Landmarks',x:-1850.1,y:-1231.8},
  {id:'sandy',name:'Sandy Shores',area:'Blaine County',category:'Travel',x:1839.7,y:3672.9}
 ]
});
