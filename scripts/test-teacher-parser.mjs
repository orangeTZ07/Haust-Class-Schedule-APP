// Controlled local JavaScript provides an oracle for the static EAMS parser.
// Never execute a server response in this VM.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { loadTs } from "./load-ts.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const parser = await loadTs(join(here, "../src/services/eams/courseTableParser.ts"));
let passed = 0;
const check = (name, work) => { work(); passed++; console.log(`PASS ${name}`); };
const activity = (name, teacher = "actTeacherName.join(',')") =>
  `activity = new TaskActivity("id",${teacher},"course","${name}","room","Room","01110000000000000000000000000000000000000000000000000","","","","","","1","2");`;
const block = (name, teachers, actTeachers, day) => `
  var teachers=${JSON.stringify(teachers)};
  var actTeachers=${JSON.stringify(actTeachers)};
  var assistant=_.filter(actTeachers,function(t){return _.where(teachers,{id:t.id,name:t.name,lab:t.lab}).length==0 && t.lab==true;});
  if(assistant.length>0){actTeachers=_.reject(actTeachers,function(t){return _.where(assistant,{id:t.id}).length>0;});}
  var actTeacherName=[];
  _.each(actTeachers,function(t){actTeacherName.push(t.name);});
  ${activity(name)}
  index=${day}*unitCount+0;
`;
const person = (id, name, lab=false) => ({id,name,lab});
const a=person("a","Teacher A"), b=person("b","Teacher B"), c=person("c","Teacher C",true), assistant=person("assistant","Lab Assistant",true);
const source = `<script>var unitCount=14; var activity=null; var index=0;
${block("Course A",[a,person("unused","Unused Teacher")],[a],0)}
${block("Course B",[b,c],[b,c,assistant],2)}
${block("Course C",[c],[c],4)}
</script>`;
const oracle = html => {
  const received=[];
  const context={
    TaskActivity:function(...args){received.push({course:args[3],teacher:String(args[1]).split(",").join("、")});},
    CourseTable:function(){this.activities=Array.from({length:210},()=>[]);this.marshalTable=()=>{};},
    fillTable(){},
    _:{filter:(items,predicate)=>items.filter(predicate),reject:(items,predicate)=>items.filter(item=>!predicate(item)),each:(items,work)=>items.forEach(work),where:(items,fields)=>items.filter(item=>Object.entries(fields).every(([key,value])=>item[key]===value))}
  };
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) runInNewContext(match[1],context,{timeout:1000});
  return received.map(row=>({...row,course:parser.cleanCourseName(row.course)}));
};
const rows = html => parser.parseCourseTable(html).rows.map(row=>({course:row.course_name,teacher:row.teacher}));
check("each course uses the teacher actually passed to TaskActivity",()=>assert.deepEqual(rows(source),oracle(source)));
check("activity teacher subset excludes unused course teacher",()=>assert.equal(rows(source)[0].teacher,"Teacher A"));
check("multiple teachers keep course lab teacher and exclude lab assistant",()=>assert.equal(rows(source)[1].teacher,"Teacher B、Teacher C"));
check("last activity retains its teacher",()=>assert.equal(rows(source).at(-1).teacher,"Teacher C"));
check("long declaration and weekday gaps do not truncate the activity",()=>{
 const padding=`/*${"padding ".repeat(150)}*/\n`;
 const expanded=source.replaceAll("activity = new TaskActivity",padding+"activity = new TaskActivity").replaceAll("index=",padding+"index=");
 assert.deepEqual(rows(expanded),oracle(expanded));
});
check("static teacher arguments in the public sample remain supported",()=>{
 const sample=readFileSync(join(here,"fixtures/eams-npu-public-sample.html"),"utf8");
 assert.deepEqual(rows(sample),oracle(sample));
});
check("missing teacher cannot borrow the next activity teacher",()=>{
 const html=`<script>var unitCount=14;var actTeacherName=[];${activity("Unknown")}index=0*unitCount+0;${block("Following",[b],[b],1)}</script>`;
 assert.deepEqual(rows(html),oracle(html));
 assert.equal(rows(html)[0].teacher,"");
});
check("missing weekday cannot borrow the next activity weekday",()=>{
 const html=`<script>${activity("Missing",'"Teacher A"')}${activity("Following",'"Teacher B"')}index=3*unitCount+0;</script>`;
 const result=parser.parseCourseTable(html);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].course_name,"Following");
 assert.equal(result.rows[0].day_of_week,4);
 assert.equal(result.problems.length,1);
});
check("weekday lookup stops at the end of the current script",()=>{
 const result=parser.parseCourseTable(`<script>${activity("Missing",'"Teacher A"')}</script><script>index=4*unitCount+0;</script>`);
 assert.equal(result.rows.length,0);
 assert.equal(result.problems.length,1);
});
check("backup conversion retains the teacher of each activity",()=>{
 const parsed=parser.parseCourseTable(source).rows;
 const {backup}=parser.rowsToBackup(parsed);
 for(const schedule of backup.schedules){
  const course=backup.courses.find(item=>item.id===schedule.courseId);
  const original=parsed.find(row=>row.course_name===course.name&&row.day_of_week===schedule.dayOfWeek);
  assert.equal(schedule.teacher,original.teacher);
 }
});
console.log(`${passed} teacher parser checks passed`);