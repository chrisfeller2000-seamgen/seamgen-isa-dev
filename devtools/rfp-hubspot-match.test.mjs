import assert from 'node:assert/strict';
import test from 'node:test';
import { RFP_PIPELINE_ID, findHubSpotDeal } from '../workspace/scripts/rfp-hubspot-match.mjs';

// Invented deals shaped like the team's: "Agency - Project", or just the project.
const rfpDeal = name => ({ name, pipeline: RFP_PIPELINE_ID });
const salesDeal = name => ({ name, pipeline: '141833480' });
const websiteRfp = { title: 'Website Design, Development, and Maintenance Services', agency: 'Transportation Corridor Agencies' };
const matched = (rfp, deals) => findHubSpotDeal(rfp, deals)?.name ?? null;

test('October 16: a website RFP is not matched by other clients\' website deals', () => {
  assert.equal(matched(websiteRfp, [
    salesDeal('Example State University - Website Design and Development'),
    rfpDeal('Example State University - Website Design and Development'),
    rfpDeal('Choir Board Website Design and Development'),
    rfpDeal('Lakeview, California - Website Design &amp; Maintenance'),
    rfpDeal('Website Redesign'),
  ]), null);
});

test('the same agency and project matches, by name or acronym', () => {
  for (const name of ['Transportation Corridor Agencies - Website Design', 'TCA - Website Redesign', 'TCA - Website Redesign RFP 2026-14']) {
    assert.equal(matched(websiteRfp, [rfpDeal(name)]), name, name);
  }
  // Same agency, different project.
  assert.equal(matched(websiteRfp, [rfpDeal('TCA - Toll Data Platform')]), null);
  // Only RFP-pipeline deals count.
  assert.equal(matched(websiteRfp, [salesDeal('TCA - Website Redesign')]), null);
});

test('agency-and-project deals, project-only deals, and HubSpot\'s escaped ampersands', () => {
  assert.equal(matched({ title: 'Interactive Digital Platform', agency: 'City of Springfield Beach' },
    [rfpDeal('Springfield Beach - Interactive Digital Platform - RFP 1234RF')]), 'Springfield Beach - Interactive Digital Platform - RFP 1234RF');
  assert.equal(matched({ title: 'Rural Health Data Atlas', agency: 'State Office of Rural Health' }, [rfpDeal('Rural Health Data Atlas')]), 'Rural Health Data Atlas');
  assert.equal(matched({ title: 'Regional Transit Data Hub', agency: 'Metro Transit' }, [rfpDeal('Rural Health Data Atlas')]), null);
  assert.equal(matched({ title: 'Website Redesign & Employee Intranet', agency: 'Example City' },
    [rfpDeal('Example City - Website Redesign &amp; Employee Intranet')]), 'Example City - Website Redesign &amp; Employee Intranet');
  // A matching solicitation number counts.
  assert.equal(matched({ title: 'Online Rental Registration', agency: 'City of Example', number: '46-25' },
    [rfpDeal('City of Example - RFP 46-25 Online Rental Registration System')]), 'City of Example - RFP 46-25 Online Rental Registration System');
  // One shared word, the state, is not enough.
  assert.equal(matched({ title: 'Tax Filing Portal', agency: 'Example Department of Revenue' }, [rfpDeal('State of Example - Benefits Portal')]), null);
  assert.equal(findHubSpotDeal(websiteRfp, []), null);
});
