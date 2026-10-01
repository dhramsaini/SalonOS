# JS helpers for scene steps (run inside the demo app).
import json
def js(code): return ['js', code]
def mark_row(row, tag, col=None):
    """Tag a table row (or one of its cells; col=-1 = last) whose text starts with `row` -> highlight '$[data-demo=tag]'."""
    c = '' if col is None else ("const cs=[...tr.children];el=cs[%d<0?cs.length+%d:%d];" % (col, col, col))
    return js("const tr=[...document.querySelectorAll('tr')].find(r=>(r.innerText||'').trim().startsWith(%s));if(tr){let el=tr;%s el.setAttribute('data-demo',%s);el.scrollIntoView({block:'center'});}" % (json.dumps(row), c, json.dumps(tag)))
def click_in_row(row, text, nth=-1):
    """Click the nth (default last) element containing `text` inside the row starting with `row`."""
    return js("const tr=[...document.querySelectorAll('tr')].find(r=>(r.innerText||'').trim().startsWith(%s));if(tr){const b=[...tr.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').includes(%s));const x=b.at(%d);if(x){x.scrollIntoView({block:'center'});x.click();}}" % (json.dumps(row), json.dumps(text), nth))
def mark(css_or_text, tag):
    """Tag the first element matching css (prefix $) or containing text."""
    if css_or_text.startswith('$'):
        q = "document.querySelector(%s)" % json.dumps(css_or_text[1:])
    else:
        q = "[...document.querySelectorAll('*')].filter(e=>e.children.length<3&&(e.innerText||'').trim().startsWith(%s)).pop()" % json.dumps(css_or_text)
    return js("const el=%s;if(el){el.setAttribute('data-demo',%s);el.scrollIntoView({block:'center'});}" % (q, json.dumps(tag)))
def set_select(match_text, option_text):
    return js("const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.text.trim().startsWith(%s)));if(s){const o=[...s.options].find(o=>o.text.trim().startsWith(%s));const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));}" % (json.dumps(match_text), json.dumps(option_text)))
def scroll_modal(px):
    return js("const m=[...document.querySelectorAll('.modal')].pop();if(m){m.scrollTop=%d;const b=m.querySelector('.modal-body');if(b)b.scrollTop=%d;}" % (px, px))
def scroll_page(px):
    return js("const m=document.querySelector('.main')||document.scrollingElement;m.scrollTop=%d;window.scrollTo(0,%d);" % (px, px))
D = lambda tag: '$[data-demo="%s"]' % tag
