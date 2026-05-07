'use client';

import { CopyButton } from './copy-button';

const EMBED_CODE = `<div class="energy-savings-calculator">
    <div class="left-panel">
        <div class="logo">
            <img src="https://www.lexairconditioning.com/wp-content/uploads/2024/01/cropped-lex-logo@2x.png" alt="Lex Air Conditioning">
        </div>
        <div class="tabs">
            <div class="tab active" onclick="showTab('cooling')">Cooling</div>
            <div class="tab" onclick="showTab('heating')">Heating</div>
        </div>
        <div id="coolingInputs" class="active">
            <label for="acCapacity">Current AC Capacity</label>
            <select id="acCapacity">
                <option value="0">Select AC capacity</option>
                <option value="1">1 Ton</option>
                <option value="2">2 Tons</option>
                <option value="3">3 Tons</option>
                <option value="4">4 Tons</option>
                <option value="5">5 Tons</option>
            </select>
            <label for="currentSEER">Current SEER</label>
            <select id="currentSEER">
                <option value="0">Select Current SEER</option>
                <option value="8">8 SEER</option>
                <option value="9">9 SEER</option>
                <option value="10">10 SEER</option>
                <option value="12">12 SEER</option>
                <option value="14">14 SEER</option>
            </select>
            <label for="newSEER">New SEER</label>
            <select id="newSEER">
                <option value="0">Select New SEER</option>
                <option value="15">15 SEER</option>
                <option value="16">16 SEER</option>
                <option value="17">17 SEER</option>
                <option value="18">18 SEER</option>
                <option value="20">20 SEER</option>
                <option value="22">22 SEER</option>
            </select>
        </div>
        <div id="heatingInputs">
            <label for="btuPerSeason">Average BTU per Heating Season</label>
            <input type="number" id="btuPerSeason" value="77000000" min="0" step="1000000">
            <label for="currentAFUE">Current AFUE <span>(Annual Fuel Utilization Efficiency)</span></label>
            <select id="currentAFUE">
                <option value="0">Select Current AFUE</option>
                <option value="70">70 AFUE</option>
                <option value="80">80 AFUE</option>
                <option value="90">90 AFUE</option>
            </select>
            <label for="newAFUE">New AFUE <span>(Annual Fuel Utilization Efficiency)</span></label>
            <select id="newAFUE">
                <option value="0">Select New AFUE</option>
                <option value="90">90 AFUE</option>
                <option value="95">95 AFUE</option>
                <option value="97">97 AFUE</option>
            </select>
        </div>
        <button onclick="calculateSavings()">Calculate</button>
        <div class="disclaimer">
            This calculator is only intended to give you a rough estimate for homes located in North Texas. The savings are not guaranteed. Calculations are based on $0.156/kWh avg for electricity and $2.41 per therm avg for natural gas, 2300 hours per average cooling season and 77 million BTU's per avg heating season in North Texas.
        </div>
    </div>
    <div class="right-panel" id="coolingPanel" style="background: #e6f0fa;">
        <div id="coolingResults" class="results active">
            <h3>Cooling Savings</h3>
            <p id="coolingComparison">0 SEER vs 0 SEER on a 0 BTU Air Conditioner</p>
            <div class="circle-container">
                <div class="circle" id="coolingSavingsCircle"></div>
                <div class="circle-inner" id="coolingSavingsPercent">0%</div>
            </div>
            <p>Savings per year</p>
            <p id="coolingMonthlySavings" class="monthly-savings">Monthly savings: $0</p>
            <div class="cost-comparison">
                <div>Annual Energy Cost</div>
                <div id="coolingNewCost">New cost: $0</div>
                <div id="coolingCurrentCost">Current cost: $0</div>
            </div>
            <div class="bar-chart" id="coolingBarChart">
                <div class="bar" id="coolingBar5yr" style="height: 0px; background: #0056b3;">
                    <div class="bar-label">$0</div>
                    <div class="bar-value">5-YRS</div>
                </div>
                <div class="bar" id="coolingBar10yr" style="height: 0px; background: #0056b3;">
                    <div class="bar-label">$0</div>
                    <div class="bar-value">10-YRS</div>
                </div>
                <div class="bar" id="coolingBar15yr" style="height: 0px; background: #0056b3;">
                    <div class="bar-label">$0</div>
                    <div class="bar-value">15-YRS</div>
                </div>
            </div>
        </div>
        <div id="heatingResults" class="results">
            <h3>Heating Savings</h3>
            <p id="heatingComparison">0 AFUE vs 0 AFUE</p>
            <div class="circle-container">
                <div class="circle" id="heatingSavingsCircle"></div>
                <div class="circle-inner" id="heatingSavingsPercent">0%</div>
            </div>
            <p>Savings per year</p>
            <p id="heatingMonthlySavings" class="monthly-savings">Monthly savings: $0</p>
            <div class="cost-comparison">
                <div>Annual Energy Cost</div>
                <div id="heatingNewCost">New cost: $0</div>
                <div id="heatingCurrentCost">Current cost: $0</div>
            </div>
            <div class="bar-chart" id="heatingBarChart">
                <div class="bar" id="heatingBar5yr" style="height: 0px; background: #b30000;">
                    <div class="bar-label">$0</div>
                    <div class="bar-value">5-YRS</div>
                </div>
                <div class="bar" id="heatingBar10yr" style="height: 0px; background: #b30000;">
                    <div class="bar-label">$0</div>
                    <div class="bar-value">10-YRS</div>
                </div>
                <div class="bar" id="heatingBar15yr" style="height: 0px; background: #b30000;">
                    <div class="bar-label">$0</div>
                    <div class="bar-value">15-YRS</div>
                </div>
            </div>
        </div>
    </div>
</div>
<style>
.energy-savings-calculator*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,sans-serif!important}
.energy-savings-calculator{display:flex;max-width:800px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.15);overflow:hidden}
.energy-savings-calculator .left-panel{width:40%;padding:20px;background:#f9f9f9}
.energy-savings-calculator .logo{text-align:center;margin-bottom:20px}
.energy-savings-calculator .logo img{max-width:150px;height:auto}
.energy-savings-calculator .right-panel{width:60%;padding:20px}
.energy-savings-calculator .tabs{display:flex;margin-bottom:20px}
.energy-savings-calculator .tab{flex:1;padding:10px;text-align:center;border:1px solid #ddd;cursor:pointer;background:#f0f0f0}
.energy-savings-calculator .tab.active{background:#fff;border-bottom:none}
.energy-savings-calculator label{display:block;margin:10px 0 5px;font-size:14px;color:#333}
.energy-savings-calculator label span{font-size:12px;color:#666}
.energy-savings-calculator select,.energy-savings-calculator input[type="number"]{width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:14px;background:#fff}
.energy-savings-calculator button{width:100%;padding:10px;background:#000;color:#fff;border:none;border-radius:4px;font-size:16px;cursor:pointer;margin-top:20px}
.energy-savings-calculator button:hover{background:#333}
.energy-savings-calculator .results{text-align:center}
.energy-savings-calculator .results h3{font-size:18px;margin:10px 0}
.energy-savings-calculator .circle-container{position:relative;width:120px;height:120px;margin:0 auto}
.energy-savings-calculator .circle{width:100%;height:100%;border-radius:50%;background:conic-gradient(#0056b3 0% 0%,#ccc 0% 100%);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:bold;color:#333}
.energy-savings-calculator .circle-inner{position:absolute;top:5px;left:5px;width:110px;height:110px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center}
.energy-savings-calculator .cost-comparison{margin:20px 0;font-size:14px;text-align:right}
.energy-savings-calculator .cost-comparison div{margin:5px 0}
.energy-savings-calculator .monthly-savings{font-size:14px;color:#333;margin:10px 0}
.energy-savings-calculator .bar-chart{display:flex;justify-content:space-around;align-items:flex-end;height:150px;margin-top:20px}
.energy-savings-calculator .bar{width:60px;position:relative;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.energy-savings-calculator .bar-label{position:absolute;top:-25px!important;width:100%;text-align:center;font-size:14px;color:#333;white-space:nowrap}
.energy-savings-calculator .bar-value{position:absolute;bottom:-25px!important;width:100%;text-align:center;font-size:12px;color:#333;white-space:nowrap}
.energy-savings-calculator .disclaimer{font-size:12px;color:#666;text-align:center;margin-top:20px;line-height:1.4;padding:0 10px}
.energy-savings-calculator #coolingInputs,.energy-savings-calculator #heatingInputs{display:none}
.energy-savings-calculator #coolingInputs.active,.energy-savings-calculator #heatingInputs.active{display:block}
.energy-savings-calculator #coolingResults,.energy-savings-calculator #heatingResults{display:none}
.energy-savings-calculator #coolingResults.active,.energy-savings-calculator #heatingResults.active{display:block}
@media(max-width:600px){.energy-savings-calculator{flex-direction:column}.energy-savings-calculator .left-panel,.energy-savings-calculator .right-panel{width:100%}.energy-savings-calculator .logo img{max-width:120px}.energy-savings-calculator .circle-container{width:100px;height:100px}.energy-savings-calculator .circle-inner{width:90px;height:90px;top:5px;left:5px}.energy-savings-calculator .bar{width:40px}}
</style>
<script>
var currentTab='cooling';
function showTab(tab){currentTab=tab;document.querySelectorAll('.energy-savings-calculator .tab').forEach(function(t){t.classList.remove('active')});document.querySelectorAll('.energy-savings-calculator .tab')[tab==='cooling'?0:1].classList.add('active');document.getElementById('coolingInputs').classList.remove('active');document.getElementById('heatingInputs').classList.remove('active');document.getElementById('coolingResults').classList.remove('active');document.getElementById('heatingResults').classList.remove('active');document.getElementById(tab+'Inputs').classList.add('active');document.getElementById(tab+'Results').classList.add('active');document.getElementById('coolingPanel').style.background=tab==='cooling'?'#e6f0fa':'#f9e6e6'}
function calculateSavings(){if(currentTab==='cooling'){calculateCoolingSavings()}else{calculateHeatingSavings()}}
function calculateCoolingSavings(){var acCapacity=parseInt(document.getElementById("acCapacity").value);var currentSEER=parseInt(document.getElementById("currentSEER").value);var newSEER=parseInt(document.getElementById("newSEER").value);if(acCapacity===0||currentSEER===0||newSEER===0){alert("Please select valid values for all fields.");return}var hours=2300;var costPerKWh=0.156;var btuPerHour=acCapacity*12000;var currentKWh=(btuPerHour*hours)/(currentSEER*1000);var newKWh=(btuPerHour*hours)/(newSEER*1000);var currentCost=currentKWh*costPerKWh;var newCost=newKWh*costPerKWh;var annualSavings=currentCost-newCost;var monthlySavings=annualSavings/12;var savingsPercent=((currentCost-newCost)/currentCost)*100;savingsPercent=Math.min(savingsPercent,100);var circle=document.getElementById("coolingSavingsCircle");circle.style.background="conic-gradient(#0056b3 0% "+savingsPercent+"%, #ccc "+savingsPercent+"% 100%)";document.getElementById("coolingComparison").innerText=currentSEER+" SEER vs "+newSEER+" SEER on a "+btuPerHour+" BTU Air Conditioner";document.getElementById("coolingSavingsPercent").innerText=Math.round(savingsPercent)+"%";document.getElementById("coolingNewCost").innerText="New cost: $"+Math.round(newCost);document.getElementById("coolingCurrentCost").innerText="Current cost: $"+Math.round(currentCost);document.getElementById("coolingMonthlySavings").innerText="Monthly savings: $"+Math.round(monthlySavings);var maxHeight=120;var maxSavings=annualSavings*15;var scale=maxSavings>0?maxHeight/maxSavings:0;document.getElementById("coolingBar5yr").style.height=(annualSavings*5*scale)+"px";document.getElementById("coolingBar5yr").querySelector(".bar-label").innerText="$"+Math.round(annualSavings*5);document.getElementById("coolingBar10yr").style.height=(annualSavings*10*scale)+"px";document.getElementById("coolingBar10yr").querySelector(".bar-label").innerText="$"+Math.round(annualSavings*10);document.getElementById("coolingBar15yr").style.height=(annualSavings*15*scale)+"px";document.getElementById("coolingBar15yr").querySelector(".bar-label").innerText="$"+Math.round(annualSavings*15)}
function calculateHeatingSavings(){var btuPerSeason=parseInt(document.getElementById("btuPerSeason").value);var currentAFUE=parseInt(document.getElementById("currentAFUE").value);var newAFUE=parseInt(document.getElementById("newAFUE").value);if(!btuPerSeason||currentAFUE===0||newAFUE===0){alert("Please select valid values for all fields.");return}var costPerTherm=2.41;var thermsNeededCurrent=(btuPerSeason/100000)/(currentAFUE/100);var thermsNeededNew=(btuPerSeason/100000)/(newAFUE/100);var currentCost=thermsNeededCurrent*costPerTherm;var newCost=thermsNeededNew*costPerTherm;var annualSavings=currentCost-newCost;var monthlySavings=annualSavings/12;var savingsPercent=((currentCost-newCost)/currentCost)*100;savingsPercent=Math.min(savingsPercent,100);var circle=document.getElementById("heatingSavingsCircle");circle.style.background="conic-gradient(#b30000 0% "+savingsPercent+"%, #ccc "+savingsPercent+"% 100%)";document.getElementById("heatingComparison").innerText=currentAFUE+" AFUE vs "+newAFUE+" AFUE";document.getElementById("heatingSavingsPercent").innerText=Math.round(savingsPercent)+"%";document.getElementById("heatingNewCost").innerText="New cost: $"+Math.round(newCost);document.getElementById("heatingCurrentCost").innerText="Current cost: $"+Math.round(currentCost);document.getElementById("heatingMonthlySavings").innerText="Monthly savings: $"+Math.round(monthlySavings);var maxHeight=120;var maxSavings=annualSavings*15;var scale=maxSavings>0?maxHeight/maxSavings:0;document.getElementById("heatingBar5yr").style.height=(annualSavings*5*scale)+"px";document.getElementById("heatingBar5yr").querySelector(".bar-label").innerText="$"+Math.round(annualSavings*5);document.getElementById("heatingBar10yr").style.height=(annualSavings*10*scale)+"px";document.getElementById("heatingBar10yr").querySelector(".bar-label").innerText="$"+Math.round(annualSavings*10);document.getElementById("heatingBar15yr").style.height=(annualSavings*15*scale)+"px";document.getElementById("heatingBar15yr").querySelector(".bar-label").innerText="$"+Math.round(annualSavings*15)}
</script>`;

const PREVIEW_DOC = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;padding:0;background:#fff;}</style>
</head>
<body>
${EMBED_CODE}
</body>
</html>`;

export function SeerSavingsCalculator() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted leading-relaxed">
        Embed this calculator on your website to help customers estimate energy savings
        when upgrading their HVAC system. Copy the code below and paste it into any HTML
        page or block.
      </p>
      <div className="rounded-card border border-border overflow-hidden">
        <div className="flex items-center justify-between bg-surface-2 px-4 py-2">
          <span className="text-[12px] text-muted">Embed code</span>
          <CopyButton text={EMBED_CODE} />
        </div>
        <pre className="bg-bg text-[11px] text-up p-4 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed border-t border-border">
          <code>{EMBED_CODE}</code>
        </pre>
      </div>
      <div>
        <div className="text-eyebrow uppercase text-muted mb-2">Preview</div>
        <div className="rounded-card border border-border overflow-hidden bg-white">
          <iframe
            srcDoc={PREVIEW_DOC}
            title="SEER Savings Calculator preview"
            className="w-full border-0"
            style={{ height: 520 }}
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  );
}
