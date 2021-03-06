// 템플릿 요소들의 부모 클래스 역할을 하는 TemplateElement 클래스

// 용어 정리
// 커스텀 요소: 사용자가 템플릿 요소를 생성하기 위해 직접 HTML에 입력한 요소 (ex. <drop-down> ... </drop-down>) ( = this )
// 템플릿 요소: 사용자가 입력한 데이터를 바탕으로 최종적으로 생성된 요소 (ex. <div class="drop-down"> ... </div>) ( = this.body )
class TemplateElement extends HTMLElement {
  // 생성자 파라미터로 아래 4개 멤버를 가진 객체를 받는다.
  // template:
  // 템플릿 요소가 생성할 요소의 HTML 구조를 나타낸다.
  // templateHandler:
  // 템플릿을 바탕으로 DOM에 등록된 요소(this.body)의 하위 요소들을 변수화 시키거나,
  // 후에 다른 핸들러에서 사용하기 위한 데이터를 선언한다.
  // childHandler:
  // 커스텀 요소의 자식 요소들이 각각 DOM에 등록될 때 실행되는 메소드
  // 등록된 자식요소 각각을 나타내는 addedNode를 파라미터로 받아 처리한다.
  // dataHandler:
  // data-* 속성에 대해 처리하는 메소드들의 집합 객체.
  // 예를들어, data-title 속성값에 대한 처리는 title이라는 이름의 메소드로 처리한다.
  constructor({
    template = "",
    templateHandler = () => {},
    childHandler = () => {},
    dataHandler = {},
  } = {}) {
    super();

    // 입력받은 파라미터들을 멤버로 등록한다.
    this.__template = template;
    this.__templateHandler = templateHandler.bind(this);
    this.__childHandler = childHandler.bind(this);
    this.__dataHandler = dataHandler;
    this.__called = false;
    this.__openBracket = "{";
    this.__closeBracket = "}";
    this.__bindBracket = [this.__openBracket, this.__closeBracket];
    this.data = {};
    this.__origins = [];

    // data-* 속성들의 속성명을 배열로 저장
    this.__datas = Object.keys(dataHandler);

    for (let i = 0; i < this.__datas.length; i++) {
      let val = this.__datas[i];
      this[`_${val}`] = "";
      this.__datas[i] = `data-${val}`;
    }
  }

  // data-* 속성이 등록/수정될 때마다 해당 속성에 대한 dataHandler를 호출
  setAttr(val, newVal) {
    val = val.replace("data-", "");
    this[`_${val}`] = newVal;
    this.__dataHandler[val].call(this, newVal);
  }

  // 커스텀 요소가 DOM에 등록되었을 때 호출되는 메소드
  connectedCallback() {
    if (this.__called) return;
    this.__called = true;
    // 커스텀 요소 바로 뒤에 템플릿 요소(this.body)를 등록
    let temp = document.createElement("div");
    temp.innerHTML = this.__template;
    temp = temp.firstElementChild;

    this.body = this.insertAfter(temp);

    // templateHandler 호출
    this.__templateHandler();

    // 콜백을 가지고 observer 등록
    // 이제 this의 childList에 변화가 있을 때마다 callback이 실행됩니다.
    const observer = new MutationObserver(this.childAddedCallback.bind(this));
    observer.observe(this, { childList: true });

    let children = this.childNodes;

    this.registryChildren(children);

    // observer 등록
    const attrObserver = new MutationObserver(this.attrCallback.bind(this));
    attrObserver.observe(this.body, { attributes: true });

    // 커스텀 요소의 속성들 템플릿 요소로 모두 복사
    this.copyAttrsTo(this.body);

    this.body.classList.remove("_hidden");

    // 템플릿 요소를 croquis 객체에 등록
    // 등록될 때는 카멜케이스로 변환되어 등록된다 ( some-el => someEl )
    // if (this.getAttribute("id")) {
    //   window.croquis[this.getAttribute("id").toCamelCase()] = this.body;
    // }

    // 커스텀 요소를 DOM에서 제거
    this.parentElement.removeChild(this);
  }

  fromTemplate(query) {
    return this.body.querySelector(query);
  }

  fromTemplateAll(query) {
    return this.body.querySelectorAll(query);
  }

  registryChildren(children) {
    for (let i = 0; i < children.length; i++) {
      let addedNode = children[i];

      if (
        croquis.isElement(addedNode) ||
        !croquis.isEmpty(addedNode.data.replace(/(\s*)/g, ""))
      ) {
        this.__origins.push(addedNode);
        this.__childHandler(addedNode);
      }
    }
  }

  childAddedCallback(mutationsList, observer) {
    let children = [];
    for (let mutation of mutationsList) {
      if (mutation.addedNode != undefined) {
        children.push(mutation.addedNode[0]);
      }
    }

    this.registryChildren(children);
  }

  attrCallback(mutationsList, observer) {
    for (let mutation of mutationsList) {
      let attrName = mutation.attributeName;

      if (attrName == "data-bind") {
        let target = mutation.target.getAttribute(attrName);

        if (!_croquis.dataMap.has(target)) {
          croquis[target] = {};
          this.data = croquis[target];
        } else {
          this.data = croquis[target];
        }

        this.registryBindingNodes();

        continue;
      }

      if (attrName == "data-bind-bracket") {
        let parted = mutation.target
          .getAttribute("data-bind-bracket")
          .split(" ");

        this.__openBracket = parted[0];
        this.__closeBracket = parted[1];

        this.__bindBracket = [this.__openBracket, this.__closeBracket];

        continue;
      }

      // data-* 속성만 감지하여 dataHandler 실행 (setAttr 메소드 내에서)
      if (attrName.indexOf("data-") != -1) {
        let newVal = mutation.target.getAttribute(attrName);

        this[`_${attrName.replace("data-", "")}`] = newVal;

        if (attrName.replace("data-", "") in this.__dataHandler) {
          this.setAttr(attrName, newVal);
        }
      }
    }
  }

  registryBindingNodes() {
    let textNodes = croquis.getTextNodesUnder(this.body);
    let reg = new RegExp(
      `${this.__bindBracket[0]}.+?${this.__bindBracket[1]}`,
      "g"
    );

    for (let t of textNodes) {
      let value = t.nodeValue;
      let matches = value.match(reg);
      if (matches != null) {
        for (let target of matches) {
          let targetValue = target
            .replace(this.__bindBracket[0], "")
            .replace(this.__bindBracket[1], "");

          let cutted = "";

          if (t.nodeValue == target) {
            cutted = t;
          }

          if (t.nodeValue != target) {
            let s = t.nodeValue.indexOf(target);
            let e = t.nodeValue.indexOf(target) + target.length;

            t = t.splitText(s);
            cutted = t;
            t = t.splitText(e - s);
          }

          if (!(targetValue in this.data)) {
            this.data[targetValue] = "";
            cutted.nodeValue = "";
          } else {
            cutted.nodeValue = this.data[targetValue];
          }

          let path = this.data._name + "." + targetValue;

          if (!("_target" in _croquis.origin.get(path))) {
            _croquis.origin.get(path)._target = [];
          }

          _croquis.origin.get(path)._target.push(cutted);
        }
      }
    }
  }
}

export default TemplateElement;
