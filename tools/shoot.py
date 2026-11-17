"""Headless test + screenshots for 阳光城. Usage: python3 tools/shoot.py <outdir>"""
import sys, os, asyncio
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'screenshots')
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'PAGEERROR: {e}'))
        await pg.goto('file://' + os.path.join(ROOT, 'index.html'))
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=os.path.join(OUT, '1_menu.png'))

        # 自由行走 + 偷车
        await pg.evaluate("SC.startGame(null)")
        await pg.wait_for_timeout(500)
        await pg.evaluate("SC.step(20)")
        await pg.screenshot(path=os.path.join(OUT, '2_start.png'))

        # 任务 2：抢运钞车 + 警车追逐
        await pg.evaluate("""() => {
          const G = SC.game, P = SC.player;
          G.money = 1850; G.missionIdx = 1;
          document.getElementById('banner').classList.add('hidden');
          SC.startMission(1);
          const van = G.mission.van;
          P.x = van.x - 3; P.z = van.z;
          SC.enterCar(van);
          van.speed = 18;
          SC.step(2);
          // 后方三辆警车
          [[-14, 3], [-22, -3], [-32, 2]].forEach(o => {
            const c = SC.createCar('police', van.x + o[0], van.z + o[1], Math.PI/2);
            c.driver = 'police'; c.ai = {fi: 5, fj: 1, ti: 6, tj: 1}; c.speed = 24;
          });
          SC.K['KeyW'] = true;
        }""")
        for i in range(4):
            await pg.evaluate("SC.step(10)")
        await pg.evaluate("document.getElementById('banner').classList.add('hidden')")
        await pg.screenshot(path=os.path.join(OUT, '3_chase.png'))
        await pg.evaluate("SC.K['KeyA']=true; SC.step(14); SC.K['KeyA']=false; SC.step(16)")
        await pg.screenshot(path=os.path.join(OUT, '4_chase_turn.png'))
        state = await pg.evaluate("""() => ({stars: SC.game.stars, money: SC.game.money, mission: SC.game.mission && SC.game.mission.text,
            van: SC.game.mission && [Math.round(SC.game.mission.van.x), Math.round(SC.game.mission.van.z), Math.round(SC.game.mission.van.speed)],
            police: SC.cars.filter(c=>c.type==='police').map(c=>[Math.round(c.x),Math.round(c.z)]), state: SC.game.state})""")
        print('STATE', state)
        await pg.evaluate("SC.K['KeyW']=false")

        # 任务 3 赛车中
        await pg.evaluate("""() => {
          const G = SC.game, P = SC.player;
          if (P.inCar) { P.inCar.driver = null; P.inCar = null; }
          G.mission = null; G.stars = 0; SC.cars.filter(c=>c.type==='police').forEach(c=>{c.driver=null;});
          G.missionIdx = 2; G.upg.engine = 2;
          SC.startMission(2);
          G.mission.timer = 87.4; G.mission.cp = 1; G.mission.target = {x: 432, z: 72};
          const c = SC.createCar('car', 300, 76, Math.PI/2, 0xff70a6);
          P.x = 300; P.z = 79; SC.enterCar(c); c.speed = 30;
          G.snapCam = true; SC.K['KeyW'] = true;
          document.getElementById('banner').classList.add('hidden');
        }""")
        await pg.evaluate("SC.step(40)")
        await pg.screenshot(path=os.path.join(OUT, '5_race.png'))
        await pg.evaluate("SC.K['KeyW']=false")

        # 改装店
        await pg.evaluate("""() => { const P=SC.player; if(P.inCar){P.inCar.speed=0;} SC.game.money = 2400; }""")
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(OUT, '6_pause.png'))
        print('ERRORS', errs[:20])
        await b.close()

asyncio.run(main())
