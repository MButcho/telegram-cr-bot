const TelegramBot = require("node-telegram-bot-api");
//const fs = require("fs");
//const token = fs.readFileSync(".access").toString().trim();
const { token, dev, test_grp, crc_group, ignore_nodes } = require('./config.json');
const { crc_members, crc_sec } = require('./council.json');
const codes = require('./codes.json');
const fetch = require("node-fetch");
const request = require("request");

let loop = false;
let check_mins = 5;
let show_date = false;
let show_log_msg = false;
if (dev) {
  check_mins = 0.1;
  show_date = true;
  show_log_msg = true;
}
let check_interval = check_mins * 60 * 1000;

// basic variables
const ver = "v1.6.5";
//const api_ela = "https://api.elastos.io/ela";
const api_ela = " https://api.elasafe.com/ela";
const api_eid = "https://api.elastos.io/eid";
const api_proposals = "https://api.cyberrepublic.org/api/cvote/list_public?voteResult=all";
let connection_ok = true;
const err_msg = "API is currently in down, please try again later ...";
let all_voted = '😎 Everyone voted! Well done!\n\u200b';
const max_proposals = 9;
const blocks_proposal = 5040;

// Bot start date
let start_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
let start_date_raw = new Date();

// Create a new client instance
const bot = new TelegramBot(token, { polling: true });
//const test_grp = "-1001845333390"; // Bot test group in config.json
//const crc_group = "-1001564031697"; // CR council group in config.json
//const elastos_main = "-1001243388272"; // elastos main chat
//const elastos_new = "-1001780081897"; // new elastos group

let days = 0;
let hours = 0;
let minutes = 0;
let seconds = 0;
let height = 0;
let block_height = "";

// Command section
bot.onText(/\/ping/, async (msg, data) => {
  let command_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  let command_date_raw = new Date();
  let seconds_since_start = (command_date_raw - start_date_raw) / 1000;
  
  console.log((show_date ? command_date + " ":"") + `Ping command triggered`);
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  days = Math.floor(seconds_since_start / (60 * 60 * 24));
  hours = Math.floor((seconds_since_start % (60 * 60 * 24)) / (60 * 60));
  minutes = Math.floor((seconds_since_start % (60 * 60)) / 60);
  
  height = await blockHeight();
  
  // calculate next loop run
  let next_loop_round = Math.trunc((parseInt(seconds_since_start)/60)/check_mins)+1;
  let next_loop_raw = ((check_mins*next_loop_round)-(seconds_since_start/60)).toFixed(2);
  let next_loop_mins = Math.floor(next_loop_raw);
  let next_loop_secs = Math.floor((next_loop_raw - next_loop_mins)*60).toString();
  // add leading 0
  if (next_loop_secs.length === 1) next_loop_secs = "0"+next_loop_secs;
  
  let msg_text = `<b>Bot running for:</b> ${days} days, ${hours} hours, ${minutes} minutes\n\n<b>Next automatic proposals check:</b> ${next_loop_mins}:${next_loop_secs} mins\n<b>Bot start:</b> ${start_date} UTC\n<b>Elastos block height:</b> ${height}\n<b>Source code:</b> <a href="https://github.com/MButcho/telegram-cr-bot">CRC Telegram Bot ${ver}</a>\n\u200b`;
  bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
});

bot.onText(/\/halving/, async (msg, data) => {
  let command_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
 
  console.log((show_date ? command_date + " ":"") + `Halving command triggered`);
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  const halvingBlocks = 1051200;
  height = await blockHeight();
  
  if (connection_ok) {
    // Get next halving block
    let halvingBlock = halvingBlocks*(Math.trunc(parseInt(height)/halvingBlocks)+1);
    
    const blocksToGo = halvingBlock - parseInt(height);
    const secondsRemaining = blocksToGo * 2 * 60;

    days = Math.floor(secondsRemaining / (60 * 60 * 24));
    hours = Math.floor((secondsRemaining % (60 * 60 * 24)) / (60 * 60));
    minutes = Math.floor((secondsRemaining % (60 * 60)) / 60);
  }
  
  let msg_text = "";
  // Send message
  // Cyber Republic - Refactoring https://www.cyberrepublic.org/proposals/5fe404ea7b3b430078ea4866'
  if (connection_ok) {
    msg_text = `<b>Elastos Halving Countdown:</b> ${days} days, ${hours} hours, ${minutes} minutes\n`;
  } else {
    msg_text = `<b>Elastos Halving Countdown:</b> ${err_msg}\n`;
  }
  
  msg_text += `\n<b>ELA emission</b>\n<b>Until 12/2025</b>: 400 000 ELA / Year = ~1.52 ELA / 2 mins\n<b>Rewards are split</b>: 35% PoW Miners / 35% BPoS Nodes / 30% CR`;
  bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
});

bot.onText(/\/bpos/, async (msg, data) => {
  let command_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  
  console.log((show_date ? command_date + " ":"") + `BPoS command triggered`);
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  const bposBlocks = 1405000;
  const reqVotes = 80000;
  
  // BPoS
  let producers = "";
  let bpos_count_80 = 0;
  let bpos_count_40 = 0;
  let bpos_count_20 = 0;
  let bpos_count_0 = 0;
  let bpos_count_inactive = 0;
  let bpos_inactive = "";
  let bpos = {
    method: 'listproducers',
    params: {"state": "all", "identity":"v2"},
  };
  
  const bpos_request = await fetch(api_ela, {
    method: 'POST',
    body: JSON.stringify(bpos),
    headers: {
        'Content-Type': 'application/json'
        // fyi, NO need for content length
    }
  })
  .then(res => res.json())
  .then(json => producers = json.result.producers)
  //.then(json => producers = json.result.producers)
  .catch (err => console.log(err))
  
  producers.forEach(producer => {
    let dposv2votes = producer.dposv2votes;
    let state = producer.state;
    let nickname = producer.nickname;
    
    if (!ignore_nodes.includes(nickname)) {
      if (state == "Active") {
        if (parseInt(dposv2votes) > reqVotes) {
          bpos_count_80 = bpos_count_80 + 1;
        } else if (parseInt(dposv2votes) > reqVotes/2) {
          bpos_count_40 = bpos_count_40 + 1;
        }  else if (parseInt(dposv2votes) > reqVotes/4) {
          bpos_count_20 = bpos_count_20 + 1;
        } else {
          bpos_count_0 = bpos_count_0 + 1;
        }
      
      } else if (state == "Inactive") {
        bpos_count_inactive = bpos_count_inactive + 1;
        bpos_inactive += nickname + "\n"
      }
    }
  });
  
  bpos_count = bpos_count_80 + bpos_count_40 + bpos_count_20 + bpos_count_0
  
  // Send message
  let msg_text = "";
  msg_text += `<b>Active BPoS nodes</b>\nTotal active: <b>${bpos_count}</b>\n80k+ votes: <b>${bpos_count_80}</b>\n40k+ votes: <b>${bpos_count_40}</b> (${bpos_count_80+bpos_count_40})\n20k+ votes: <b>${bpos_count_20}</b> (${bpos_count_80+bpos_count_40+bpos_count_20})\nLess than 20k+ votes: <b>${bpos_count_0}</b> (${bpos_count})\n\n`;
  msg_text += `<b>Inactive BPoS nodes</b>\nTotal inactive: <b>${bpos_count_inactive}</b>\n${bpos_inactive}\n`;
  
  height = await blockHeight();
  if (connection_ok) {
    block_height = parseInt(height);
  } else {
    block_height = err_msg;
  }
  msg_text += `<b>BPoS Initiation</b>\nBPoS was initiated on block ${bposBlocks}\nCurrent block: ${block_height}`;
  // Cyber Republic - Refactoring https://www.cyberrepublic.org/proposals/5fe404ea7b3b430078ea4866'
  
  bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
});

bot.onText(/\/election/, async (msg, data) => {
  let command_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  
  console.log((show_date ? command_date + " ":"") + `Election command triggered`);
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  const councilTerm = 262800;
  const firstCouncil = 658930;
  const electionPeriod = 21600;
  const transitionPeriod = 10080;
  let electionStateMsg = "";
  let transitionState = false;
  
  let blocksToGo = 0;    
  
  let electionClose = 0;
  let electionStart = 0;
  let ranks = "";
  let totalVotes = 0;
  let voted = "";
  
  height = await blockHeight();
  
  if (connection_ok) {        
    block_height = parseInt(height);
    //block_height = 1437249;
    
    // Get election dates
    electionClose = parseInt(firstCouncil)+(councilTerm*(Math.trunc((block_height-parseInt(firstCouncil))/parseInt(councilTerm))+1))-transitionPeriod;
    electionStart = electionClose - electionPeriod;
    
    if (block_height >= electionClose && block_height <= electionClose+transitionPeriod) transitionState = true; // if transition period
    //console.log(block_height, electionClose, block_height , electionClose+transitionPeriod, transitionState);
    if (block_height > electionStart && block_height < electionClose) {
      blocksToGo = electionClose - block_height;
      electionStatus = "Election Status";
    } else {
      if (!transitionState) {
        blocksToGo = electionStart - block_height;
      } else {
        electionStart = electionClose;
        electionClose = electionClose + transitionPeriod;
        blocksToGo = electionClose - block_height;
      }
      electionStatus = "Election Results";
    }
    
    const secondsRemaining = blocksToGo < 0 ? 0 : blocksToGo * 2 * 60;
    days = Math.floor(secondsRemaining / (60 * 60 * 24));
    hours = Math.floor((secondsRemaining % (60 * 60 * 24)) / (60 * 60));
    minutes = Math.floor((secondsRemaining % (60 * 60)) / 60);
    seconds =Math.floor(secondsRemaining % 60);
    let candidates = "";
    
    if (!transitionState) {
      candidates = await getData("listcrcandidates");
      if (candidates.totalcounts > 0) {
        candidates.crcandidatesinfo.forEach((candidate) => {
          let output = codes.filter(a => a.code == candidate.location);
          let location_name = "-";
          if (output.length > 0) {
            location_name = output[0].name;
          }
          ranks += `<b>${candidate.index+1}.</b> ${candidate.nickname} (${location_name}) <i><a href="${candidate.url}">web</a></i> -- <b>${parseFloat(candidate.votes).toLocaleString("en", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}</b>` + "\n";
        
          totalVotes += parseFloat(candidate.votes);
          /*if (candidate.Rank === 12) {
            crcs = crcs + "\n";
          }*/
        });
      } else {
        ranks = "No candidate available yet";
      }
    } else {
      candidates = await getData("listnextcrs");
      if (candidates.totalcounts > 0) {
        candidates.crmembersinfo.forEach((candidate) => {
          let output = codes.filter(a => a.code == candidate.location);
          let location_name = "-";
          if (output.length > 0) {
            location_name = output[0].name;
          }
          ranks += `<b>${candidate.index+1}.</b> ${candidate.nickname} (${location_name}) <i><a href="${candidate.url}">web</a></i>\n`;
        });
      } else {
        ranks = "No candidate available yet";
      }
    }
    
    if (!transitionState) voted += `<b><i>Total ELA voted -- ${new Intl.NumberFormat('en-US').format(totalVotes)}</i></b>\n\n`;
    
    if (ranks.length > 4096) {
      ranks = ranks.substring(1, 4096);
    }
  }
  let msg_text = "";
  if (connection_ok) {      
    msg_text += `<b>${electionStatus}</b>\n${ranks}\n`;
    msg_text += `-----------------------------------------\n${voted}`;
    if (!transitionState) {
      if (block_height > electionStart && block_height < electionClose) {
        electionStateMsg = `CR Election in progress`;
        electionStateTime = `<b>End in:</b> ${days} days, ${hours} hours, ${minutes} minutes`;
        
      } else {
        electionStateMsg = `Next CR Council election`;
        electionStateTime = `<b>Start in:</b> ${days} days, ${hours} hours, ${minutes} minutes`;
      }
    } else {
      electionStateMsg = `Transition period`;
      electionStateTime = `<b>End in:</b> ${days} days, ${hours} hours, ${minutes} minutes`;
    }
    
    msg_text += `<b>${electionStateMsg}</b>\n<b>Start:</b> Block height -- <b>${new Intl.NumberFormat('en-US').format(electionStart)}</b>\n<b>Current:</b> Block height -- <b>${new Intl.NumberFormat('en-US').format(block_height)}</b>\n<b>End:</b> Block height -- <b>${new Intl.NumberFormat('en-US').format(electionClose)}</b>\n${electionStateTime}\n`;
  } else {
    msg_text += `<b>CR Election</b>${err_msg}`;
  }
  
  bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
});

bot.onText(/\/council/, async (msg, data) => {
  let command_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  
  console.log((show_date ? command_date + " ":"") + `Council command triggered`);
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  const councilTerm = 262800;
  const firstCouncil = 658930;
  let electionStateMsg = "";
  
  let blocksToGo = 0;    
  let currentCouncilEnd = 0;
  let currentCouncilStart = 0;
  let secsCurrentCouncil = 0;
  let days = 0;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let crcs = "";
  
  height = await blockHeight();
  
  if (connection_ok) {        
    block_height = parseInt(height);
    //block_height = 1447331;   
    
    // Get election dates
    currentCouncilEnd = parseInt(firstCouncil)+(councilTerm*(Math.trunc((block_height-parseInt(firstCouncil))/parseInt(councilTerm))+1));
    currentCouncilStart = currentCouncilEnd - councilTerm;
    blocksToGo = currentCouncilEnd - block_height;
    secsCurrentCouncil = blocksToGo < 0 ? 0 : blocksToGo * 2 * 60;
    days = Math.floor(secsCurrentCouncil / (60 * 60 * 24));
    hours = Math.floor((secsCurrentCouncil % (60 * 60 * 24)) / (60 * 60));
    minutes = Math.floor((secsCurrentCouncil % (60 * 60)) / 60);
    seconds = Math.floor(secsCurrentCouncil % 60);
    
    const crc = await getData("listcurrentcrs");
    crc.crmembersinfo.forEach((candidate) => {
      // crcs = crcs + "{0:<20} {1}".format(key, value) + "\n"
      let output = codes.filter(a => a.code == candidate.location);      
      let location_name = "-";
      if (output.length > 0) {
        location_name = output[0].name;
      }
      crcs += `<b>${candidate.index+1}.</b> ${candidate.nickname} (${location_name}) <i><a href="${candidate.url}">web</a></i>\n`;
    });
    
  }
  
  let msg_text = "";
  if (connection_ok) {      
    msg_text += `<b>Current CR council</b>\n${crcs}\n`;
    msg_text += `<b>Current CR council term</b>\n<b>Start:</b> Block height -- <b>${new Intl.NumberFormat('en-US').format(currentCouncilStart)}</b>\n<b>Current:</b> Block height -- <b>${new Intl.NumberFormat('en-US').format(block_height)}</b>\n<b>End:</b> Block height -- <b>${new Intl.NumberFormat('en-US').format(currentCouncilEnd)}</b>\n<b>End in:</b> ${days} days, ${hours} hours, ${minutes} minutes\n`;
  } else {
    msg_text += `Current CR council ${err_msg}`;
  }
  
  bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
});


bot.onText(/\/proposals/, async (msg, data) => {
  let command_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  
  console.log((show_date ? command_date + " ":"") + `Proposals command triggered`);
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  const res = await fetch(api_proposals);
  const proposalList = await res.json();

  height = await blockHeight();
  
  const active = proposalList.data.list.filter((item) => {
    return item.status === "PROPOSED";
    //return item.status === "ACTIVE"; // testing
    //return item.proposedEndsHeight > height && item.status === "PROPOSED";
    //return item.proposedEndsHeight < height && item.status === "ACTIVE"; // test
  });
  
  let msg_text = "";

  if (active.length > 0) {
    let index = 0;
     
    active.reverse().forEach((item, index) => {
      index++;
      let secondsRemaining = 0;
      if (connection_ok) {
        secondsRemaining =
          parseFloat(item.proposedEndsHeight) - parseFloat(height) < 0
            ? 0
            : (parseFloat(item.proposedEndsHeight) - parseFloat(height)) * 2 * 60;
      }
      days = Math.floor(secondsRemaining / (60 * 60 * 24));
      hours = Math.floor((secondsRemaining % (60 * 60 * 24)) / (60 * 60));
      minutes = Math.floor((secondsRemaining % (60 * 60)) / 60);

      msg_text += `<b>${index}. <a href="https://www.cyberrepublic.org/proposals/${item._id}">${item.title}</a></b>\n`;
      msg_text += `<b>Proposed by:</b> ${item.proposedBy}\n`;
      msg_text += `<b>Time remaining:</b> ${days} days, ${hours} hours, ${minutes} minutes\n`;
      
      let support = 0;
      let reject = 0;
      let undecided = 0;
      let abstention = 0;
      let undecideds = [];
      let unchained = [];
      //let vote_log = '';
      item.voteResult.forEach((vote) => {
        //console.log(JSON.stringify(vote));
        if (vote.value === "support") support++;
        if (vote.value === "reject") reject++;
        if (vote.value === "abstention") abstention++;
        if (vote.value === "undecided") {
          undecided++;
          undecideds.push(vote.votedBy);
        }
        
        if (vote.value !== "undecided" && vote.status === "unchain") {
          let t_uname = getCRC(vote.votedBy, "t_uname");
          let nickname = getCRC(vote.votedBy, "nickname");
          unchained.push(`<b>${t_uname}</b> (${vote.value})`);
        }
        
        //let test_txt = getCRC(vote.votedBy, "nickname");
        //vote_log += `${test_txt} - ${vote.reason}\n`;
      });
      //console.log(vote_log);
      let unchainedList = '';
      if (unchained.length > 0) {
        unchained.forEach((warning) => {
          unchainedList += `${warning}\n`;
        });
      };
      
      let undecidedList = '';
      if (undecideds.length !== 0) {
        undecideds.forEach((member) => {
          let t_uname = getCRC(member, "t_uname");
          undecidedList += `${t_uname}\n`;          
        });
      };
              
      let voting_status = `✅  Support - <b>${support}</b>\n❌  Reject - <b>${reject}</b>\n🔘  Abstain - <b>${abstention}</b>\n⚠  Undecided - <b>${undecided}</b>\n\u200b`;
      
      if (unchained.length == 0) voting_status += '\u200b';
      //proposals += `<i><a href='https://www.cyberrepublic.org/proposals/${item._id}'>View on Cyber Republic website</a></i>`;
      msg_text += `<b>Voting Status:</b>\n${voting_status}`; 
      if (undecidedList.length > 0) {
        msg_text += `\n⚠ <b>Not Voted Yet:</b>\n${undecidedList}`;
      } else {
         if (unchained.length > 0) {
          msg_text += `\n⚠ <b>Not Chained</b> ⚠\n${unchainedList}`;
        } else {
          msg_text += `\n✅ <b>Voting</b>\n${all_voted}`;
        }
      }
     
      msg_text += "\n";
      
      // display in 9 proposals batches
      if (active.length < 9 || index % max_proposals === 0) {
        bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
        msg_text = "";
      }
    });
  } else {
    msg_text += `<b>There are currently no proposals in the council voting period</b>`;
    bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
  }  
});

/*bot.onText(/\/test/, async (msg, data) => {
  let command_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  
  console.log((show_date ? command_date + " ":"") + `Proposals command triggered`);
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  height = await blockHeight();
  
  let msg_text = "";
  let index = 0;
  proposals = await getData("listcrproposalbasestate");
  if (proposals.totalcounts > 0) {
    proposals.proposalbasestates.forEach(async (proposal) => {
      index++;
      let secondsRemaining = 0;
      if (connection_ok) {
        secondsRemaining =
          parseFloat((proposal.registerHeight + blocks_proposal)) - parseFloat(height) < 0
            ? 0
            : (parseFloat((proposal.registerHeight) + blocks_proposal)- parseFloat(height)) * 2 * 60;
      }
      days = Math.floor(secondsRemaining / (60 * 60 * 24));
      hours = Math.floor((secondsRemaining % (60 * 60 * 24)) / (60 * 60));
      minutes = Math.floor((secondsRemaining % (60 * 60)) / 60);
      
      let proposerName = await getName(proposal.proposerDID);
      
      msg_text += `<b>${index}. ${proposal.proposalTitle}</b>\n`;
      if (proposerName != proposal.proposerDID) msg_text += `<b>Proposed by:</b> ${proposerName}\n`;
      msg_text += `<b>Time remaining:</b> ${days} days, ${hours} hours, ${minutes} minutes\n`;
            
      let approve = 0;
      let reject = 0;
      let undecided = 0;
      let abstain = 0;
      let undecideds = [];
      
      let crvotes = Object.entries(proposal.crvotes);
      crc_members.forEach((crc) => {
        let found = false;
        crvotes.forEach((crvote) => {
          if (crvote[0] == crc.did) {
            found = true;
            if (crvote[1] == "approve") approve++;
            if (crvote[1] == "reject") reject++;
            if (crvote[1] == "abstain") abstain++;
          }
        });
        if (!found) {
          undecideds.push(crc.nickname);
          undecided++;
        }
      });
      
      let undecidedList = '';
      if (undecideds.length !== 0) {
        for(const name of undecideds) {
          //let name = await getName(did);
          undecidedList += `${name}\n`;
        }
      }
      
      let voting_status = `✅  Approve - <b>${approve}</b>\n❌  Reject - <b>${reject}</b>\n🔘  Abstain - <b>${abstain}</b>\n⚠  Undecided - <b>${undecided}</b>\n\u200b`;
      msg_text += `<b>Council Votes:</b>\n${voting_status}`;
      
      if (undecidedList.length > 0) {
        msg_text += `\n⚠ <b>Not Voted Yet:</b>\n${undecidedList}`;
      } else {
        msg_text += `\n✅ <b>Voting</b>\n${all_voted}`;
      }
      
      // display in 9 proposals batches
      if (proposals.proposalbasestates.length < 9 || index % max_proposals === 0) {
        bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
        msg_text = "";
      }
    });
  } else {
    msg_text += `<b>There are currently no proposals in the council voting period</b>`;
    bot.sendMessage(chatId, msg_text, { parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: messageId});
  }
});*/

// Automated section

bot.getMe().then(function (info) {
  const start_text = `Logged in as @${info.username} on ${ver}`;
  console.log((show_date ? start_date + " ":"") + start_text);
  if (show_log_msg) bot.sendMessage(dev ? test_grp:crc_group, start_text, { parse_mode: "HTML" });
});

let storedAlerts = {};
setInterval(async () => {
  let loop_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  //console.log(show_date ? loop_date:"", `Loop - Started`);

  const res = await fetch(api_proposals);
  const proposalList = await res.json();
  
  height = await blockHeight();
  
  if (connection_ok) {
    const active = proposalList.data.list.filter((item) => {
      return item.proposedEndsHeight > height && item.status === "PROPOSED";
      //return item.proposedEndsHeight > height && item.status === "ACTIVE"; // testing
    });
    
    //console.log('active.length - ' + active.length);
    
    if (active.length > 0) {
      active.forEach((item) => {
        let support = 0;
        let reject = 0;
        let abstention = 0;
        let undecided = 0;
        let undecideds = [];
        let unchained = [];
        let msg_text = "";

        item.voteResult.forEach((vote) => {
          if (vote.value === "support") support++;
          if (vote.value === "reject") reject++;
          if (vote.value === "abstention") abstention++;
          if (vote.value === "undecided") {
            undecided++;
            undecideds.push(vote.votedBy);
          }
          
          if (vote.value !== "undecided" && vote.status === "unchain") {
            let t_uname = getCRC(vote.votedBy, "t_uname");
            let nickname = getCRC(vote.votedBy, "nickname");
            unchained.push(`<b>${t_uname}</b> (${vote.value})`);
          }
        });
        
        let voting_status = `✅  Support - <b>${support}</b>\n❌  Reject - <b>${reject}</b>\n🔘  Abstain - <b>${abstention}</b>\n⚠  Undecided - <b>${undecided}</b>\n`;
        
        let unchainedList = '';
        if (unchained.length > 0) {
          unchained.forEach((warning) => {
            unchainedList += `${warning}\n`;
          });
        }
        let undecidedList = '';
        let failedList = '';
        if (undecideds.length !== 0) {
          undecideds.forEach((member) => {
            let value = getCRC(member, "t_uname");
            undecidedList += `${value}\n`;          
            failedList += `${value}\n`;          
          });
        };
        
        let _message = "";
        let description = "";
        let show_unchained = false;
        let show_undecided = true;
        let show_failed = false;
        
        const blocksRemaining = item.proposedEndsHeight - height;
        //console.log("Blocks remaining: " + blocksRemaining);

        if (blocksRemaining > 4990) {
          if (storedAlerts[item._id] === 7) return;
          description = '❇️ Whoa! A new proposal is now open for voting! 👀';
          storedAlerts[item._id] = 7;
        } else if (blocksRemaining < 3600 && blocksRemaining > 3550) {
          if (storedAlerts[item._id] === 5) return;
          description = '👌 Reminder! There are <i>5 days</i> remaining to vote on proposal';
          storedAlerts[item._id] = 5;
        } else if (blocksRemaining < 2160 && blocksRemaining > 2110) {
          if (storedAlerts[item._id] === 3) return;
          description = '👉 Hey you! 👈 There are <i>3 days</i> remaining to vote on proposal';
          if (unchained.length > 0) show_unchained = true;
          storedAlerts[item._id] = 3;
        } else if (blocksRemaining < 720 && blocksRemaining > 670) {
          if (storedAlerts[item._id] === 1) return;
          description = '⚠ Warning! ⚠ There is only <i>1 day</i> remaining to vote on proposal';
          if (unchained.length > 0) show_unchained = true;
          storedAlerts[item._id] = 1;
        } else if (blocksRemaining < 360 && blocksRemaining > 310) {
          if (storedAlerts[item._id] === 0.5) return;
          description = '‼ Alert! ‼ There are only <i>12 hours</i> remaining to vote on proposal';
          if (unchained.length > 0) show_unchained = true;
          storedAlerts[item._id] = 0.5;
        } else if (blocksRemaining <= 7) {
          if (storedAlerts[item._id] === 0) return;
          description = '☠ The council voting period has elapsed for proposal';
          if (unchained.length > 0) show_unchained = true;
          show_failed = true;
          show_undecided = false;
          storedAlerts[item._id] = 0;
        } else {
          return;
        }

        // Send message
        msg_text += `<b><a href="https://www.cyberrepublic.org/proposals/${item._id}">${item.title}</a></b>\n`;
        msg_text += `<b>${description}</b>\n<b>Proposed by</b>: ${item.proposedBy}\n`;
        msg_text += `<b>Voting Status</b>:\n${voting_status}`;
        if (show_unchained) msg_text += `⚠ <b>Not Chained Yet</b>\n${unchainedList}`;
        if (show_undecided) {
          if (undecidedList.length > 0) {
            msg_text += `\n⚠ <b>Not Voted Yet</b>\n${undecidedList}`;
          } else {
            msg_text += `\n✅ <b>Voting</b>\n${all_voted}`;
          }
        }
        if (show_failed) {
          if (failedList.length > 0) {
            msg_text += `\n⛔️ <b>Failed to vote</b>\n${failedList}`;
          } else {
            msg_text += `\n✅ <b>Voting</b>\n${all_voted}`;
          }
        }
        bot.sendMessage(dev ? test_grp:crc_group, msg_text, { parse_mode: "HTML" });
        loop_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        console.log((show_date ? loop_date + " ":"") + `Loop - Automatic proposal message sent`);
      });
    } else {
      // Send message
      let msg_text = "There are currently no proposals in the council voting period";
      
      // disabled upon request 30.12.2021
      //bot.sendMessage(crc_group, msg_text, { parse_mode: "HTML" });
      //console.log((show_date ? loop_date + " ":"") + `Loop - No proposals active [${height}]`);
    }
    //loop_date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    //console.log((show_date ? loop_date + " ":"") + `Loop - Finished, active proposals [${active.length}], height [${height}]`);
  }
}, check_interval);

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 8000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal  
  });
  clearTimeout(id);
  
  return response;
}

async function blockHeight() {
  let height_params = {
    method: 'getcurrentheight'      
  };
  
  const height_request = await fetchWithTimeout(api_ela, {
    timeout: 6000,
    method: 'POST',
    body: JSON.stringify(height_params),
    headers: {
        'Content-Type': 'application/json'
    }
  })
  .then(res => res.json())
  .then(json => height = json.result)
  .catch (err => console.log("Error in getcurrentheight"));
  //height = 1420585;
  return height;
}

async function getData(type) {
  let crc_params = "";
  if (type == "listcrproposalbasestate") {
    crc_params = {
      method: type,
      params: {
        "state": "registered"
      }
    };
  } else {
    crc_params = {
      method: type      
    };
  }
  
  const crc_request = await fetchWithTimeout(api_ela, {
    timeout: 6000,
    method: 'POST',
    body: JSON.stringify(crc_params),
    headers: {
        'Content-Type': 'application/json'
    }
  })
  .then(res => res.json())
  .then(json => crc = json.result)
  .catch (err => console.log(`Error in ${type}`));
  return crc;
}

async function getDID(_did) {
  let api_params = {
    id: null,
    method: "did_resolveDID",
    params: [{
      did: `did:elastos:${_did}`,
    }]
  }
  
  const request = await fetchWithTimeout(api_eid, {
    timeout: 6000,
    method: 'POST',
    body: JSON.stringify(api_params),
    headers: {
        'Content-Type': 'application/json'
    }
  })
  .then(res => res.json())
  .then(json => crc = json.result)
  .catch (err => console.log(`Error in ${type}`));  
  return crc;
}

async function getName(_did) {
  let response = await getDID(_did);
  let name = '';
  try {
    let buff = new Buffer.from(response.transaction[0].operation.payload, 'base64');
    let payload = buff.toString();
    let payload_arr = JSON.parse(payload);
    
    let field = payload_arr.verifiableCredential.length - 1;
    name = payload_arr.verifiableCredential[field].credentialSubject.name;
  } catch {
    name = _did;
  }
  
  return name;
}

function getCRC(_id, _field) {
  let arr_found = crc_members.find(crc_member => crc_member.cr_id === _id);
  let value = 'Unknown';
  if (arr_found) {            
    value = arr_found[_field];
  }
  return value;
}