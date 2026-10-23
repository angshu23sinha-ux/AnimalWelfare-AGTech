/**
 * Animal Welfare Management System — AGTech starter backend.
 * Bind this script to the Google Sheets workbook in Drive.
 * Production use requires review of authentication, quotas, data policies and accounting rules.
 */
const SCHEMA = {
  Users: ['Email','Name','Role','Active','CreatedAt'],
  Animals: ['AnimalID','NameOrDescription','Species','Sex','ApproxAge','Colour','IdentificationMarks','CreatedAt','CreatedBy','Status'],
  Rescue: ['RecordID','CaseID','AnimalID','Date','Species','Location','Condition','Priority','Status','Title','Description','CreatedAt','CreatedBy','ClientID'],
  Treatment: ['RecordID','CaseID','AnimalID','Date','Veterinarian','Diagnosis','Treatment','Medicine','FollowUpDate','Cost','Title','Description','CreatedAt','CreatedBy','ClientID'],
  Adoption: ['RecordID','AnimalID','Applicant','Contact','ApplicationDate','Verification','Status','Title','Description','CreatedAt','CreatedBy','ClientID'],
  Finance: ['RecordID','Date','TransactionType','Fund','Category','Party','Amount','PaymentMode','Reference','Purpose','DocumentLink','Status','CreatedAt','CreatedBy','ClientID'],
  Stock: ['RecordID','Date','ItemID','ItemName','Batch','Expiry','Movement','Quantity','Unit','CaseID','Remarks','CreatedAt','CreatedBy','ClientID'],
  Procurement: ['RecordID','RequestDate','Requester','ItemName','Quantity','EstimatedCost','Supplier','PurchaseOrder','Invoice','Status','Remarks','CreatedAt','CreatedBy','ClientID'],
  RoleUpdates: ['RecordID','Role','Title','Message','Priority','CreatedAt','CreatedBy','ClientID'],
  Vouchers: ['VoucherID','Date','VoucherType','Fund','PayeeOrDonor','Amount','PaymentMode','Reference','Purpose','Status','CreatedBy','ApprovedBy','CreatedAt'],
  Accounts: ['AccountCode','AccountName','AccountType','Active'],
  JournalEntries: ['JournalID','Date','VoucherID','Narration','Fund','Status','CreatedBy','PostedAt'],
  JournalLines: ['JournalID','LineNo','AccountCode','Debit','Credit','Fund','Project','Narration'],
  AuditLog: ['Timestamp','ActorEmail','Action','Module','RecordID','ClientID','Details'],
  OTP: ['Email','OtpHash','ExpiresAt','Attempts','CreatedAt'],
  AppSettings: ['Key','Value']
};
const ROLE_MODULES = {
  Admin: ['Rescue','Treatment','Adoption','Finance','Stock','Procurement','RoleUpdates','Reports','Documents','Users'],
  Stock: ['Stock','Procurement','Reports','Documents'],
  Finance: ['Finance','Reports','Documents'],
  Volunteer: ['Rescue','Adoption','RoleUpdates','Reports','Documents']
};
const READ_MODULES = ['Rescue','Treatment','Adoption','Finance','Stock','Procurement','RoleUpdates'];

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open Apps Script from the target Google Sheet before running setupDatabase().');
  Object.keys(SCHEMA).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SCHEMA[name];
    if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#166534').setFontColor('#ffffff');
  });
  const settings = ss.getSheetByName('AppSettings');
  if (settings.getLastRow() < 2) settings.getRange(2,1,3,2).setValues([
    ['ORG_NAME','Sporsho (Touch the Animals)'],
    ['COPYRIGHT','AGTech Solutions'],
    ['CURRENCY','INR']
  ]);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return 'Database tabs created. Add authorised users to Users before signing in.';
}

function doGet() {
  return json_({ok:true,service:'Animal Welfare Management API',version:'0.1.0',message:'Use POST actions from the app.'});
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    if (action === 'sendOtp') return json_(sendOtp_(body.email));
    if (action === 'verifyOtp') return json_(verifyOtp_(body.email, body.otp));
    const user = requireSession_(body.token);
    if (action === 'getDashboard') return json_(dashboard_(user));
    if (action === 'listRecords') return json_(listRecords_(user, body.module));
    if (action === 'createRecord') {
      lock.waitLock(10000);
      try { return json_(createRecord_(user, body.module, body.data || {}, body.clientId || '')); }
      finally { lock.releaseLock(); }
    }
    if (action === 'getReport') return json_(report_(user, body.reportType, body.from, body.to));
    if (action === 'getRoleUpdates') return json_(listRecords_(user, 'RoleUpdates'));
    return json_({ok:false,error:'Unknown action.'});
  } catch (err) {
    try { if (lock.hasLock()) lock.releaseLock(); } catch (_) {}
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function sendOtp_(email) {
  email = normalizeEmail_(email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false,error:'Enter a valid email address.'};
  const user = findUser_(email);
  // Do not disclose whether an email is registered.
  if (!user || !isTrue_(user.Active)) return {ok:true,message:'If this email is authorised, a code has been sent.'};
  const cache = CacheService.getScriptCache();
  const rateKey = 'otp_rate_' + email;
  if (cache.get(rateKey)) return {ok:false,error:'A code was recently requested. Please wait before trying again.'};
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const salt = Utilities.getUuid();
  const digest = sha256_(otp + ':' + salt);
  cache.put('otp_hash_' + email, digest + ':' + salt, 300);
  cache.put(rateKey, '1', 60);
  MailApp.sendEmail({to:email,subject:'Your Animal Welfare app sign-in code',body:'Your verification code is ' + otp + '. It expires in 5 minutes. If you did not request this, ignore this email.'});
  return {ok:true,message:'If this email is authorised, a code has been sent.'};
}

function verifyOtp_(email, otp) {
  email = normalizeEmail_(email);
  const user = findUser_(email);
  if (!user || !isTrue_(user.Active)) return {ok:false,error:'Email or code is invalid, or the account is inactive.'};
  const cache = CacheService.getScriptCache();
  const saved = cache.get('otp_hash_' + email);
  if (!saved) return {ok:false,error:'Code expired. Request a new code.'};
  const parts = saved.split(':');
  if (parts.length !== 2 || sha256_(String(otp || '') + ':' + parts[1]) !== parts[0]) return {ok:false,error:'Email or code is invalid.'};
  cache.remove('otp_hash_' + email);
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g,'');
  cache.put('session_' + token, email, 21600);
  audit_(email,'LOGIN','Auth','', '', 'Email OTP verified');
  return {ok:true,token:token,user:{email:email,name:String(user.Name||''),role:String(user.Role||'Volunteer')}};
}

function requireSession_(token) {
  if (!token) throw new Error('Please sign in again.');
  const email = CacheService.getScriptCache().get('session_' + token);
  if (!email) throw new Error('Session expired. Please sign in again.');
  const user = findUser_(email);
  if (!user || !isTrue_(user.Active)) throw new Error('Account inactive. Contact the administrator.');
  user.Email = email;
  return user;
}

function dashboard_(user) {
  const rescue = rows_('Rescue');
  const treatment = rows_('Treatment');
  const finance = rows_('Finance');
  const activeTreatment = treatment.filter(r => String(r.Status||'').toLowerCase() !== 'closed').length;
  const fundsReceived = finance.filter(r => ['donation','grant'].includes(String(r.TransactionType||'').toLowerCase()) && String(r.Status||'Posted').toLowerCase() !== 'rejected').reduce((s,r)=>s+num_(r.Amount),0);
  const expenditure = finance.filter(r => ['expense','purchase','reimbursement'].includes(String(r.TransactionType||'').toLowerCase()) && String(r.Status||'Posted').toLowerCase() !== 'rejected').reduce((s,r)=>s+num_(r.Amount),0);
  const recent = [];
  READ_MODULES.forEach(module => rows_(module).slice(-5).forEach(r => recent.push({module:module,id:r.RecordID||r.CaseID||'',title:r.Title||r.CaseID||r.ItemName||r.Purpose||r.Applicant||r.Party||module+' record',status:r.Status||r.Priority||'Recorded',date:r.Date||r.CreatedAt||r.ApplicationDate||''})));
  recent.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return {ok:true,data:{rescueCases:rescue.length,activeTreatment:activeTreatment,fundsReceived:fundsReceived,expenditure:expenditure,recent:recent.slice(0,12)}};
}

function listRecords_(user, module) {
  if (!READ_MODULES.includes(module)) return {ok:false,error:'Unknown module.'};
  const records = rows_(module).slice(-200).reverse();
  if (module === 'RoleUpdates') {
    const role = String(user.Role || '');
    return {ok:true,records:records.filter(r => !r.Role || r.Role === 'All' || r.Role === role)};
  }
  return {ok:true,records:records};
}

function createRecord_(user, module, data, clientId) {
  const role = String(user.Role || '');
  if (!ROLE_MODULES[role] || !ROLE_MODULES[role].includes(module)) return {ok:false,error:'Your role does not have permission to create records in this module.'};
  if (!READ_MODULES.includes(module)) return {ok:false,error:'Unsupported module.'};
  if (!data || typeof data !== 'object') return {ok:false,error:'Invalid record data.'};
  if (clientId && findByClientId_(module, clientId)) return {ok:true,duplicate:true,message:'This offline entry was already synchronised.'};
  const recordId = module.toUpperCase().slice(0,3) + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random()*900+100);
  const common = {RecordID:recordId,CreatedAt:new Date().toISOString(),CreatedBy:user.Email,ClientID:clientId||'',Title:String(data.title||data.caseId||data.itemName||data.purpose||data.applicant||''),Description:String(data.description||data.condition||data.message||data.purpose||'')};
  const aliases = {
    Rescue:{caseId:'CaseID',animalId:'AnimalID',date:'Date',species:'Species',location:'Location',condition:'Condition',priority:'Priority',status:'Status',title:'Title',description:'Description'},
    Treatment:{caseId:'CaseID',animalId:'AnimalID',date:'Date',veterinarian:'Veterinarian',diagnosis:'Diagnosis',treatment:'Treatment',medicine:'Medicine',followUpDate:'FollowUpDate',cost:'Cost',title:'Title',description:'Description'},
    Adoption:{animalId:'AnimalID',applicant:'Applicant',contact:'Contact',applicationDate:'ApplicationDate',verification:'Verification',status:'Status',title:'Title',description:'Description'},
    Finance:{date:'Date',transactionType:'TransactionType',fund:'Fund',category:'Category',party:'Party',amount:'Amount',paymentMode:'PaymentMode',reference:'Reference',purpose:'Purpose',documentLink:'DocumentLink'},
    Stock:{date:'Date',itemId:'ItemID',itemName:'ItemName',batch:'Batch',expiry:'Expiry',movement:'Movement',quantity:'Quantity',unit:'Unit',caseId:'CaseID',remarks:'Remarks'},
    Procurement:{requestDate:'RequestDate',requester:'Requester',itemName:'ItemName',quantity:'Quantity',estimatedCost:'EstimatedCost',supplier:'Supplier',purchaseOrder:'PurchaseOrder',invoice:'Invoice',status:'Status',remarks:'Remarks'},
    RoleUpdates:{role:'Role',title:'Title',message:'Message',priority:'Priority'}
  };
  const map = Object.assign({}, common);
  Object.keys(data).forEach(k => { const target = aliases[module] && aliases[module][k] ? aliases[module][k] : k; map[target] = data[k]; });
  if (module === 'Finance') {
    const amount = num_(data.amount);
    if (!(amount > 0)) return {ok:false,error:'Amount must be greater than zero.'};
    // Finance records are drafts until a separately authorised posting workflow is implemented.
    map.Status = 'Draft';
  }
  if (module === 'Stock' && !(num_(data.quantity) > 0)) return {ok:false,error:'Quantity must be greater than zero.'};
  const sh = sheet_(module), headers = SCHEMA[module];
  const row = headers.map(h => map[h] === undefined ? '' : map[h]);
  sh.appendRow(row);
  audit_(user.Email,'CREATE',module,recordId,clientId,JSON.stringify({keys:Object.keys(data)}));
  return {ok:true,id:recordId,message:'Record saved. Financial entries remain draft until approved and posted.'};
}

function report_(user, reportType, from, to) {
  const types = {
    'Organisation summary':['Rescue','Treatment','Adoption','Finance','Stock','Procurement'],
    'Rescue register':['Rescue'],'Treatment register':['Treatment'],'Adoption register':['Adoption'],
    'Donation register':['Finance'],'Income and expenditure':['Finance'],'Fund-wise balance':['Finance'],
    'Medicine stock':['Stock'],'Procurement register':['Procurement'],'Role updates':['RoleUpdates']
  };
  const modules = types[String(reportType||'')] || [];
  if (!modules.length) return {ok:false,error:'Unknown report type.'};
  let out=[];
  modules.forEach(m => {
    if (!READ_MODULES.includes(m)) return;
    rows_(m).forEach(r => {
      const d = String(r.Date||r.CreatedAt||r.ApplicationDate||r.RequestDate||'').slice(0,10);
      if (from && d && d < from) return;
      if (to && d && d > to) return;
      if (m === 'RoleUpdates' && r.Role && r.Role !== 'All' && r.Role !== user.Role) return;
      out.push(Object.assign({module:m},r));
    });
  });
  return {ok:true,reportType:reportType,rows:out.slice(-1000)};
}

function findUser_(email) {
  const list = rows_('Users');
  return list.find(r => normalizeEmail_(r.Email) === email) || null;
}
function rows_(name) {
  const sh = sheet_(name), vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  const headers = vals[0].map(String);
  return vals.slice(1).filter(row => row.some(v => v !== '')).map(row => { const obj={}; headers.forEach((h,i)=>obj[h]=row[i] instanceof Date ? row[i].toISOString() : row[i]); return obj; });
}
function sheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Database not configured. Run setupDatabase() from the target Google Sheet.');
  let sh = ss.getSheetByName(name);
  if (!sh) { if (!SCHEMA[name]) throw new Error('Unknown table: '+name); sh=ss.insertSheet(name); sh.appendRow(SCHEMA[name]); }
  return sh;
}
function findByClientId_(module, clientId) { return rows_(module).some(r => String(r.ClientID||'') === String(clientId)); }
function audit_(email, action, module, recordId, clientId, details) { try { sheet_('AuditLog').appendRow([new Date().toISOString(),email,action,module,recordId,clientId,details]); } catch (_) {} }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function normalizeEmail_(email) { return String(email||'').trim().toLowerCase(); }
function isTrue_(v) { return v === true || String(v).toLowerCase() === 'true' || String(v) === '1'; }
function num_(v) { const n=Number(v); return Number.isFinite(n)?n:0; }
function sha256_(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map(b=>(b+256).toString(16).slice(-2)).join(''); }
