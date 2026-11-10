import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {openSofrehDatabase} from '../packages/backend/src/db.mjs';
import {seedSyntheticStage1Data,authenticateByToken,createOrderTransactional} from '../packages/backend/src/service.mjs';

test('fixture-only legacy constraints migrate without losing orders, rows or indexes',()=>{
  const runtime=path.join(process.env.LOCALAPPDATA,'ElegantRuntime','Sofreh','tests');fs.mkdirSync(runtime,{recursive:true});
  const file=path.join(fs.mkdtempSync(path.join(runtime,'migration-')),'legacy.sqlite');
  const current=openSofrehDatabase(':memory:');seedSyntheticStage1Data(current);
  const customer=authenticateByToken(current,'test-token-customer-nima');
  const dish=current.prepare("SELECT id,cook_id FROM dish_slots WHERE cook_id='cook-test-pari' AND availability_mode='TODAY_AVAILABLE' LIMIT 1").get();
  const order=createOrderTransactional(current,customer,{cookId:dish.cook_id,items:[{dishId:dish.id,quantity:1}],fulfillmentType:'pickup'});
  const legacy=new DatabaseSync(file);
  try{for(const table of current.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
    const sql=table.sql.replace(/CHECK \(is_synthetic_test_(fixture|order) IN \(0, 1\)\)/g,'CHECK (is_synthetic_test_$1 = 1)');
    legacy.exec(sql);const columns=current.prepare(`PRAGMA table_info(${table.name})`).all().map(column=>column.name);
    const insert=legacy.prepare(`INSERT INTO ${table.name}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
    for(const row of current.prepare(`SELECT * FROM ${table.name}`).all())insert.run(...columns.map(column=>row[column]));
  }legacy.exec('CREATE INDEX legacy_order_status ON orders(status)');}finally{legacy.close();current.close();}
  const upgraded=openSofrehDatabase(file);try{
    assert.equal(upgraded.prepare('SELECT id FROM orders WHERE id=?').get(order.id).id,order.id);
    assert.equal(upgraded.prepare('SELECT count(*) AS n FROM order_items WHERE order_id=?').get(order.id).n,1);
    assert.equal(upgraded.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE name='legacy_order_status'").get());
    upgraded.prepare("UPDATE cook_profiles SET is_synthetic_test_fixture=0,synthetic_badge_label='' WHERE id=?").run(dish.cook_id);
    upgraded.prepare("UPDATE orders SET is_synthetic_test_order=0 WHERE id=?").run(order.id);
  }finally{upgraded.close();}
});

test('reseed preserves valid historical titles while repairing corrupted Persian fixtures',()=>{
  const db=openSofrehDatabase(':memory:');try{
    seedSyntheticStage1Data(db);const customer=authenticateByToken(db,'test-token-customer-nima');
    const dish=db.prepare("SELECT id,cook_id FROM dish_slots WHERE cook_id='cook-test-pari' AND availability_mode='TODAY_AVAILABLE' LIMIT 1").get();
    const order=createOrderTransactional(db,customer,{cookId:dish.cook_id,items:[{dishId:dish.id,quantity:1}],fulfillmentType:'pickup'});
    db.prepare('UPDATE order_items SET title_en_snapshot=?,title_fa_snapshot=? WHERE order_id=?').run('Historical title','عنوان تاریخی سالم',order.id);
    seedSyntheticStage1Data(db);let row=db.prepare('SELECT * FROM order_items WHERE order_id=?').get(order.id);assert.equal(row.title_fa_snapshot,'عنوان تاریخی سالم');assert.equal(row.title_en_snapshot,'Historical title');
    db.prepare('UPDATE order_items SET title_fa_snapshot=? WHERE order_id=?').run('\uFFFD',order.id);seedSyntheticStage1Data(db);
    row=db.prepare('SELECT * FROM order_items WHERE order_id=?').get(order.id);assert.equal(row.title_fa_snapshot,db.prepare('SELECT title_fa FROM dish_slots WHERE id=?').get(dish.id).title_fa);
    db.prepare('UPDATE order_items SET title_fa_snapshot=? WHERE order_id=?').run('????? ?????',order.id);seedSyntheticStage1Data(db);
    assert.equal(db.prepare('SELECT title_fa_snapshot FROM order_items WHERE order_id=?').get(order.id).title_fa_snapshot,db.prepare('SELECT title_fa FROM dish_slots WHERE id=?').get(dish.id).title_fa);
  }finally{db.close();}
});
