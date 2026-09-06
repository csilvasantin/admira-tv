/* Directed photographic routes. Nodes are included only after Google link verification. */
(function(root){
  'use strict';
  function create(records){
    const all=records.map(route=>{
      if(!route.id||!route.fromSiteId||!route.toSiteId||!Array.isArray(route.panos)||route.panos.length<2||
        route.panos.some(p=>typeof p!=='string'||!p||p.length>250)||new Set(route.panos).size!==route.panos.length)
        throw Error('Invalid urban route');
      return Object.freeze({...route,panos:Object.freeze(route.panos.slice())});
    });
    if(new Set(all.map(r=>r.id)).size!==all.length)throw Error('Duplicate urban route');
    Object.freeze(all);
    const get=id=>all.find(route=>route.id===id)||null;
    function find(pano,toSiteId){
      return all.filter(route=>route.toSiteId===toSiteId&&route.panos.includes(pano))
        .sort((a,b)=>(a.panos.length-a.panos.indexOf(pano))-(b.panos.length-b.panos.indexOf(pano)))[0]||null;
    }
    return {all,get,find};
  }
  // Verified directed paths are supplied from the route discovery evidence.
  const records=[
  {
    "id": "vila-jardinets",
    "fromSiteId": "vila",
    "toSiteId": "jardinets",
    "panos": [
      "2NoSvJbqMCZ0RXhR8pTSLA",
      "QsoL4Bqdi27Ecd4OdTf2tw",
      "2NOLXV_bglwvVhyS2TMSiQ",
      "d2CKlpCfeRZw5xiLp18bZw",
      "zDezQdIxtE3STOVvbI4zUw",
      "Q50iSNwNqO_bGvpW51Y3Jw",
      "FzzY1RXc6IHeeiaobpLTbA",
      "eEb_2euAkknefnpyNv7Uaw",
      "1FbwZIIgLOAJUxS9yiXomg",
      "0k30KD7UMpmYmWELGU163g",
      "P4nD_h-LIjoY_u4ichCT3Q",
      "LzXKT6bWm1c0HVLvbC2KnQ",
      "CIDP2mwUwxj5-jeyyAWHkw",
      "SwVAev5Nh2mP_zgQvUbqGQ",
      "cL8SFGERLjPBITxxIrytew",
      "rorLZe-PqN1XPIL2AuVJ4w",
      "LJ39jEgJZcZhqWHrulD21w",
      "gEU5GIzcbdlMvO4mGwEMXg",
      "yQDVGMF-KE6i0PtOCV5BDg",
      "ouVLEv3Y_CYbQ4tx9GbAuQ",
      "wQhBel1gfCjWvEAZR3c29Q",
      "yuMT2dAKIFCyX-KSWWvV-g",
      "uwqvr14yG9gPNZPz3J1vOw",
      "qUOoZpXgJjZNQMeyXtgxWA",
      "V22sG6dOE9lbGEJEQoP5Mg",
      "UqWU7ylNewEIq8sqFWXRwQ",
      "xjpm7swrmlUrldbjvuZcNw",
      "qnpMTPlrIiLftiUtaSDdHQ",
      "ZWw57M51YEX7oaZy2pVjDg",
      "9ZU2NiXzbh-4d6NsDa9Ocw",
      "_tq66Zl_I9BgI__VJCSDoQ",
      "CmPt_8H33G1sSuTEiyhsoA",
      "Ohjtmbu6LFTSk1YWU0bFUg",
      "Hk-ETc4_gifXXs8Ez55yzw",
      "FMHOmncArlsVAdqqgF2etg",
      "e4VXNsVVbKP9WYWHn-pOxA",
      "n-YiLHLmLabYbcsgAKfeKw",
      "qYUzETqv33MplI6-mEPlwA",
      "gpwi_JlBtxyP3fHhWpbtWg",
      "OS4FQnNmUedi4E2MTwczrg",
      "L6xcO37SQfBmCxsT9lPdjQ"
    ],
    "metres": 409.1668778048672
  },
  {
    "id": "jardinets-vila-connected",
    "fromSiteId": "jardinets",
    "toSiteId": "vila",
    "panos": [
      "L6xcO37SQfBmCxsT9lPdjQ",
      "OS4FQnNmUedi4E2MTwczrg",
      "gpwi_JlBtxyP3fHhWpbtWg",
      "qYUzETqv33MplI6-mEPlwA",
      "n-YiLHLmLabYbcsgAKfeKw",
      "e4VXNsVVbKP9WYWHn-pOxA",
      "FMHOmncArlsVAdqqgF2etg",
      "Hk-ETc4_gifXXs8Ez55yzw",
      "Ohjtmbu6LFTSk1YWU0bFUg",
      "CmPt_8H33G1sSuTEiyhsoA",
      "_tq66Zl_I9BgI__VJCSDoQ",
      "9ZU2NiXzbh-4d6NsDa9Ocw",
      "ZWw57M51YEX7oaZy2pVjDg",
      "qnpMTPlrIiLftiUtaSDdHQ",
      "xjpm7swrmlUrldbjvuZcNw",
      "UqWU7ylNewEIq8sqFWXRwQ",
      "V22sG6dOE9lbGEJEQoP5Mg",
      "qUOoZpXgJjZNQMeyXtgxWA",
      "uwqvr14yG9gPNZPz3J1vOw",
      "yuMT2dAKIFCyX-KSWWvV-g",
      "wQhBel1gfCjWvEAZR3c29Q",
      "VwkaClIfS6P2iUMmEnJS8A",
      "LjgZsWqj86eM8pB2mrYuoQ",
      "c-F0Hh0fDjpHAmCRy6HrFg",
      "d8MZdwzNZ6RDoTWlITC_uQ",
      "Wq7TaYTXgb1YsLXEg5z0vQ",
      "nQtqovXhc2cdoq6sM0gTOw",
      "2tvGt8Lq65CAlj_mx830cQ",
      "MltE1E6xGzDuBtnsAevMLQ",
      "4LMOivzbaQJvzchW11zCuw",
      "VBdmpBi8zt8IAAi4pNRUsw",
      "O9F947pqA70s9mn210eJdQ",
      "5Ol4uoUJkL3MNr5--S8S6Q",
      "q5uNnXMzkUXBI81YfjpSlg",
      "4lx2kGEhPCwzSJH59QvS4Q",
      "EVFCse110TV9YW0eExyt5w",
      "7YOgaaDGXRMryNdYPoSn0A",
      "N5LJ7l6Cljszjp_GRMwcOg",
      "Ljd5loKhDEiwzW22xJtZ8g",
      "xyBUNhtkdE7tUUGrvRPwmA"
    ],
    "metres": 397.80251140576706
  },
  {
    "id": "vila-connected-jardinets",
    "fromSiteId": "vila",
    "toSiteId": "jardinets",
    "panos": [
      "xyBUNhtkdE7tUUGrvRPwmA",
      "Ljd5loKhDEiwzW22xJtZ8g",
      "N5LJ7l6Cljszjp_GRMwcOg",
      "7YOgaaDGXRMryNdYPoSn0A",
      "EVFCse110TV9YW0eExyt5w",
      "4lx2kGEhPCwzSJH59QvS4Q",
      "q5uNnXMzkUXBI81YfjpSlg",
      "5Ol4uoUJkL3MNr5--S8S6Q",
      "O9F947pqA70s9mn210eJdQ",
      "VBdmpBi8zt8IAAi4pNRUsw",
      "4LMOivzbaQJvzchW11zCuw",
      "MltE1E6xGzDuBtnsAevMLQ",
      "2tvGt8Lq65CAlj_mx830cQ",
      "nQtqovXhc2cdoq6sM0gTOw",
      "Wq7TaYTXgb1YsLXEg5z0vQ",
      "d8MZdwzNZ6RDoTWlITC_uQ",
      "c-F0Hh0fDjpHAmCRy6HrFg",
      "LjgZsWqj86eM8pB2mrYuoQ",
      "VwkaClIfS6P2iUMmEnJS8A",
      "wQhBel1gfCjWvEAZR3c29Q",
      "yuMT2dAKIFCyX-KSWWvV-g",
      "uwqvr14yG9gPNZPz3J1vOw",
      "qUOoZpXgJjZNQMeyXtgxWA",
      "V22sG6dOE9lbGEJEQoP5Mg",
      "UqWU7ylNewEIq8sqFWXRwQ",
      "xjpm7swrmlUrldbjvuZcNw",
      "qnpMTPlrIiLftiUtaSDdHQ",
      "ZWw57M51YEX7oaZy2pVjDg",
      "9ZU2NiXzbh-4d6NsDa9Ocw",
      "_tq66Zl_I9BgI__VJCSDoQ",
      "CmPt_8H33G1sSuTEiyhsoA",
      "Ohjtmbu6LFTSk1YWU0bFUg",
      "Hk-ETc4_gifXXs8Ez55yzw",
      "FMHOmncArlsVAdqqgF2etg",
      "e4VXNsVVbKP9WYWHn-pOxA",
      "n-YiLHLmLabYbcsgAKfeKw",
      "qYUzETqv33MplI6-mEPlwA",
      "gpwi_JlBtxyP3fHhWpbtWg",
      "OS4FQnNmUedi4E2MTwczrg",
      "L6xcO37SQfBmCxsT9lPdjQ"
    ],
    "metres": 397.802511405767
  }
];
  const api={...create(records),create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.UrbanRoutes=api;
})(typeof globalThis!=='undefined'?globalThis:this);
