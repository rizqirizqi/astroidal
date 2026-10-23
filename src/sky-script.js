(function () {
  var dataElement = document.getElementById("astroidal-data");
  var canvas = document.getElementById("sky");
  var tip = document.getElementById("tip");
  var detail = document.getElementById("detail");
  var sky = canvas && canvas.closest(".sky");
  if (!dataElement || !canvas || !dataElement.textContent || !sky) return;
  var data = JSON.parse(dataElement.textContent);
  var context = canvas.getContext("2d");
  var findings = data.findings || [];
  var edges = data.edges || [];
  var nodes = (data.nodes || []).map(function (node, index) {
    return {
      index: index,
      id: node.id,
      name: node.name,
      kind: node.kind,
      path: node.path,
      line: node.line,
      signature: node.signature || "",
      spectral: node.spectral,
      role: node.role,
      units: node.units || [],
      prs: node.prs || [],
      complexity: node.complexity || 0,
      complexityDelta: node.complexityDelta || 0,
      excerpt: node.excerpt || "",
      findings: [],
      x: 0,
      y: 0,
      r: node.role === "neighbor" ? 3.4 : 5.2,
      placed: false,
    };
  });
  var byId = {};
  var changedCount = 0;
  nodes.forEach(function (node) {
    byId[node.id] = node;
    if (node.role === "changed") changedCount += 1;
    findings.forEach(function (finding) {
      if (finding.path === node.path) node.findings.push(finding);
    });
    if (node.findings.some(function (finding) { return finding.severity === "critical" || finding.severity === "high"; })) node.r = 7.5;
  });

  var camera = { x: 0, y: 0, scale: 1 };
  var selected = null;
  var hover = null;
  var drag = null;
  var pan = null;
  var down = null;
  var filter = "all";
  var moved = false;
  var looping = false;
  var clusters = [];
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stars = [];
  var random = mulberry32(42);
  for (var star = 0; star < 110; star += 1) {
    stars.push({ x: (random() - 0.5) * 2200, y: (random() - 0.5) * 1400, s: random() * 1.3 + 0.25, a: random() });
  }

  function resize() {
    var bounds = canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
    layout();
    if (!moved) fitCamera();
    if (!looping) draw();
  }

  function layout() {
    clusters = [];
    var byPath = {};
    nodes.forEach(function (node) {
      if (node.role !== "changed") return;
      if (!byPath[node.path]) byPath[node.path] = [];
      byPath[node.path].push(node);
    });
    var paths = Object.keys(byPath).sort();
    var claimed = {};
    var clouds = [];
    (data.groups || []).forEach(function (group) {
      var members = (group.paths || []).filter(function (path) { return byPath[path] && !claimed[path]; });
      if (!group.name || members.length < 2) return;
      members.forEach(function (path) { claimed[path] = true; });
      clouds.push({ label: group.name, kind: "logic", paths: members });
    });
    var directories = {};
    paths.forEach(function (path) {
      if (claimed[path]) return;
      var key = directoryKey(path);
      if (!directories[key]) directories[key] = [];
      directories[key].push(path);
    });
    var directoryNames = Object.keys(directories).sort();
    directoryNames.forEach(function (key) {
      clouds.push({ label: directoryLabel(key, directoryNames), kind: "directory", paths: directories[key] });
    });
    clouds.forEach(function (cloud, index) {
      var turn = index * 2.399963;
      var ring = clouds.length === 1 ? 0 : 120 + Math.sqrt(index) * 210;
      cloud.x = Math.cos(turn) * ring;
      cloud.y = Math.sin(turn) * ring * 0.86;
    });
    var files = [];
    clouds.forEach(function (cloud) {
      cloud.paths.forEach(function (path, index) {
        var wobble = hash(path);
        var turn = index * 2.399963 + wobble * 0.7;
        var ring = cloud.paths.length === 1 ? 0 : 78 + Math.sqrt(index) * 54 + wobble * 26;
        files.push({
          path: path,
          nodes: byPath[path].slice().sort(function (left, right) { return left.line - right.line; }),
          cloud: cloud,
          x: cloud.x + Math.cos(turn) * ring,
          y: cloud.y + Math.sin(turn) * ring,
          homeX: cloud.x + Math.cos(turn) * ring,
          homeY: cloud.y + Math.sin(turn) * ring,
        });
      });
    });
    relax(files);
    files.forEach(function (file) {
      file.nodes.forEach(function (node, index) {
        if (file.nodes.length === 1) {
          place(node, file.x, file.y);
          return;
        }
        var turn = (index / file.nodes.length) * Math.PI * 2 - Math.PI / 2;
        var ring = 26 + Math.min(file.nodes.length, 8) * 7;
        place(node, file.x + Math.cos(turn) * ring, file.y + Math.sin(turn) * ring);
      });
      clusters.push({ x: file.x, y: file.y, label: fileLabel(file.path), nodes: file.nodes, kind: "file" });
    });
    clouds.forEach(function (cloud) {
      var members = [];
      cloud.paths.forEach(function (path) { members = members.concat(byPath[path]); });
      clusters.push({ label: cloud.label, nodes: members, kind: cloud.kind });
    });
    var neighborSlot = {};
    nodes.filter(function (node) { return node.role === "neighbor"; }).forEach(function (node, index) {
      var link = linkedChange(node);
      if (!link) {
        place(node, Math.cos(index) * 280, Math.sin(index) * 280);
        return;
      }
      var slot = neighborSlot[link.id] || 0;
      neighborSlot[link.id] = slot + 1;
      var away = Math.atan2(link.y, link.x);
      place(node, link.x + Math.cos(away) * (72 + slot * 26), link.y + Math.sin(away) * (72 + slot * 26));
    });
  }

  function relax(files) {
    var linked = {};
    edges.forEach(function (edge) {
      var from = byId[edge.from];
      var to = byId[edge.to];
      if (!from || !to || from.path === to.path) return;
      linked[from.path + "|" + to.path] = true;
      linked[to.path + "|" + from.path] = true;
    });
    for (var step = 0; step < 46; step += 1) {
      var force = files.map(function () { return { x: 0, y: 0 }; });
      for (var left = 0; left < files.length; left += 1) {
        for (var right = left + 1; right < files.length; right += 1) {
          var dx = files[right].x - files[left].x;
          var dy = files[right].y - files[left].y;
          var distance = Math.sqrt(dx * dx + dy * dy) || 0.1;
          var same = files[left].cloud === files[right].cloud;
          var gap = same ? 148 : 280;
          if (distance >= gap) continue;
          var push = ((gap - distance) / distance) * (same ? 0.18 : 0.28);
          force[left].x -= dx * push;
          force[left].y -= dy * push;
          force[right].x += dx * push;
          force[right].y += dy * push;
        }
      }
      files.forEach(function (file, index) {
        files.forEach(function (other) {
          if (file === other || !linked[file.path + "|" + other.path]) return;
          force[index].x += (other.x - file.x) * 0.045;
          force[index].y += (other.y - file.y) * 0.045;
        });
        force[index].x += (file.homeX - file.x) * 0.04;
        force[index].y += (file.homeY - file.y) * 0.04;
        file.x += Math.max(-14, Math.min(14, force[index].x));
        file.y += Math.max(-14, Math.min(14, force[index].y));
      });
    }
  }

  function directoryKey(path) {
    var parts = String(path).split("/");
    parts.pop();
    return parts.join("/") || "(root)";
  }

  function directoryLabel(key, keys) {
    if (key === "(root)") return "root";
    var parts = key.split("/");
    var broad = { lib: 1, src: 1, app: 1, apps: 1, packages: 1, components: 1, test: 1, tests: 1, __tests__: 1 };
    function tail(count) {
      var slice = parts.slice(-count);
      if (count === 1 && broad[slice[0]] && parts.length > 1) return parts.slice(-2).join("/");
      var text = slice.join("/");
      return text.length > 32 ? text.slice(0, 31) + "..." : text;
    }
    for (var count = 1; count <= parts.length; count += 1) {
      var label = tail(count);
      var clash = keys.some(function (other) {
        if (other === key || other === "(root)") return false;
        var otherParts = other.split("/");
        var otherLabel = count === 1 && broad[otherParts[otherParts.length - 1]] && otherParts.length > 1
          ? otherParts.slice(-2).join("/")
          : otherParts.slice(-count).join("/");
        return otherLabel === label;
      });
      if (!clash) return label;
    }
    return parts.join("/");
  }

  function hash(value) {
    var total = 0;
    var text = String(value);
    for (var index = 0; index < text.length; index += 1) total = (total * 33 + text.charCodeAt(index)) % 997;
    return total / 997;
  }

  function linkedChange(node) {
    var found = null;
    edges.forEach(function (edge) {
      var otherId = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : "";
      var other = byId[otherId];
      if (other && other.role === "changed") found = other;
    });
    return found;
  }

  function place(node, x, y) {
    if (!node.placed) {
      node.x = x;
      node.y = y;
      node.placed = true;
    }
  }

  function trimName(name) {
    var text = String(name);
    return text.length > 28 ? text.slice(0, 27) + "..." : text;
  }

  function fileLabel(path) {
    var parts = String(path).split("/");
    var name = parts[parts.length - 1] || path;
    return name.length > 34 ? name.slice(0, 33) + "..." : name;
  }

  function fitCamera() {
    var width = canvas.clientWidth || 800;
    var height = canvas.clientHeight || 600;
    var box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    nodes.forEach(function (node) {
      box.minX = Math.min(box.minX, node.x - 120);
      box.minY = Math.min(box.minY, node.y - 48);
      box.maxX = Math.max(box.maxX, node.x + 150);
      box.maxY = Math.max(box.maxY, node.y + 36);
    });
    if (!isFinite(box.minX)) {
      camera.scale = 1;
      camera.x = 0;
      camera.y = 0;
      return;
    }
    var spanX = Math.max(box.maxX - box.minX + 160, 280);
    var spanY = Math.max(box.maxY - box.minY + 160, 220);
    camera.scale = Math.min(1.25, Math.max(0.38, Math.min((width - 48) / spanX, (height - 48) / spanY)));
    camera.x = -((box.minX + box.maxX) / 2);
    camera.y = -((box.minY + box.maxY) / 2);
  }

  function colorFor(node) {
    if (node.findings.some(function (finding) { return finding.severity === "critical"; })) return "#FFB020";
    if (node.findings.some(function (finding) { return finding.severity === "high"; })) return "#D2B4FF";
    if (node.spectral === "contract") return "#D2B4FF";
    if (node.spectral === "logic") return "#00F2FE";
    if (node.role === "neighbor") return "#7E8BA3";
    return "#C5D0E2";
  }

  function isVisible(node) {
    if (filter === "all") return true;
    if (node.units.indexOf(filter) !== -1) return true;
    if (node.role !== "neighbor") return false;
    return edges.some(function (edge) {
      var otherId = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : "";
      var other = byId[otherId];
      return other && other.units.indexOf(filter) !== -1;
    });
  }

  function toScreen(x, y) {
    return {
      x: canvas.clientWidth / 2 + (x + camera.x) * camera.scale,
      y: canvas.clientHeight / 2 + (y + camera.y) * camera.scale,
    };
  }

  function toWorld(x, y) {
    return {
      x: (x - canvas.clientWidth / 2) / camera.scale - camera.x,
      y: (y - canvas.clientHeight / 2) / camera.scale - camera.y,
    };
  }

  function traceShape(node, x, y, radius) {
    context.beginPath();
    if (node.spectral === "contract" && node.role === "changed" && node.findings.length === 0) {
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius, y);
      context.closePath();
      return;
    }
    if (node.spectral === "text" && node.role === "changed" && node.findings.length === 0) {
      var side = radius * 1.7;
      context.rect(x - side / 2, y - side / 2, side, side);
      return;
    }
    context.arc(x, y, radius, 0, Math.PI * 2);
  }

  function edgeActive(edge) {
    var from = byId[edge.from];
    var to = byId[edge.to];
    if (from && to && from.path !== to.path) return true;
    if (!hover && !selected) return edges.length <= 80;
    return edgeTouches(edge, hover) || edgeTouches(edge, selected);
  }

  function edgeTouches(edge, node) {
    return Boolean(node) && (edge.from === node.id || edge.to === node.id);
  }

  function drawCloud(cluster) {
    var points = [];
    cluster.nodes.forEach(function (node) {
      if (!isVisible(node)) return;
      points.push(toScreen(node.x, node.y));
    });
    if (points.length === 0) return;
    var hull = points.length < 3 ? points : convexHull(points);
    var center = { x: 0, y: 0 };
    hull.forEach(function (point) {
      center.x += point.x;
      center.y += point.y;
    });
    center.x /= hull.length;
    center.y /= hull.length;
    var pad = cluster.kind === "logic" ? 42 : points.length === 1 ? 22 : 34;
    var expanded = hull.map(function (point) {
      var dx = point.x - center.x;
      var dy = point.y - center.y;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: point.x + (dx / length) * pad, y: point.y + (dy / length) * pad };
    });
    if (expanded.length === 1) {
      context.beginPath();
      context.arc(expanded[0].x, expanded[0].y, pad + 18, 0, Math.PI * 2);
    } else traceBlob(expanded);
    context.fillStyle = cluster.kind === "logic" ? "rgba(127,0,255,0.14)" : "rgba(0,242,254,0.055)";
    context.fill();
    context.strokeStyle = cluster.kind === "logic" ? "rgba(210,180,255,0.72)" : "rgba(0,242,254,0.32)";
    context.lineWidth = cluster.kind === "logic" ? 1.4 : 1;
    context.setLineDash(cluster.kind === "logic" ? [5, 5] : []);
    context.stroke();
    context.setLineDash([]);
  }

  function traceBlob(points) {
    function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    context.beginPath();
    var start = mid(points[0], points[1 % points.length]);
    context.moveTo(start.x, start.y);
    for (var index = 0; index < points.length; index += 1) {
      var current = points[(index + 1) % points.length];
      var next = points[(index + 2) % points.length];
      var target = mid(current, next);
      context.quadraticCurveTo(current.x, current.y, target.x, target.y);
    }
    context.closePath();
  }

  function convexHull(points) {
    var sorted = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lower = [];
    sorted.forEach(function (point) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
      lower.push(point);
    });
    var upper = [];
    for (var index = sorted.length - 1; index >= 0; index -= 1) {
      var point = sorted[index];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function paintLabel(text, x, y, fill, font, align, force, taken) {
    context.font = font;
    var width = Math.min(168, context.measureText(text).width);
    var left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    var box = { x: left, y: y - 12, w: width, h: 15 };
    if (!force) {
      for (var index = 0; index < taken.length; index += 1) {
        var other = taken[index];
        if (box.x < other.x + other.w + 6 && box.x + box.w + 6 > other.x && box.y < other.y + other.h + 4 && box.y + box.h + 4 > other.y) return;
      }
    }
    taken.push(box);
    context.textAlign = align;
    context.shadowColor = "rgba(11,15,25,0.95)";
    context.shadowBlur = 6;
    context.fillStyle = fill;
    context.fillText(text, x, y);
    context.textAlign = "left";
    context.shadowBlur = 0;
  }

  function fileAnchor(node) {
    var cluster = null;
    clusters.forEach(function (item) {
      if (item.kind === "file" && item.nodes.indexOf(node) !== -1) cluster = item;
    });
    if (!cluster) return toScreen(node.x, node.y);
    return toScreen(cluster.x, cluster.y);
  }

  function curvePoint(start, end) {
    var midX = (start.x + end.x) / 2;
    var midY = (start.y + end.y) / 2;
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: midX + (-dy / length) * 14, y: midY + (dx / length) * 14 };
  }

  function draw() {
    var ratio = window.devicePixelRatio || 1;
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    var time = reduced ? 0 : Date.now() / 1000;
    var wash = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.1, width / 2, height / 2, Math.max(width, height) * 0.72);
    wash.addColorStop(0, "rgba(127,0,255,0.13)");
    wash.addColorStop(0.42, "rgba(11,15,25,0)");
    wash.addColorStop(1, "rgba(5,7,12,0.45)");
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);
    stars.forEach(function (star) {
      var point = toScreen(star.x, star.y);
      context.globalAlpha = 0.2 + star.a * 0.55 + (reduced ? 0 : Math.sin(time * 0.7 + star.a * 6) * 0.12);
      context.fillStyle = star.a > 0.82 ? "#00F2FE" : "#E8EEF8";
      context.beginPath();
      context.arc(point.x, point.y, star.s, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
    clusters.forEach(function (cluster) {
      if (cluster.kind !== "directory" && cluster.kind !== "logic") return;
      if (!cluster.nodes.some(isVisible)) return;
      drawCloud(cluster);
    });
    edges.forEach(function (edge) {
      if (!edgeActive(edge)) return;
      var from = byId[edge.from];
      var to = byId[edge.to];
      if (!from || !to || !isVisible(from) || !isVisible(to)) return;
      var start = toScreen(from.x, from.y);
      var end = toScreen(to.x, to.y);
      var bend = curvePoint(start, end);
      var hot = edgeTouches(edge, hover) || edgeTouches(edge, selected);
      var crosses = from.path !== to.path;
      context.strokeStyle = edge.kind === "caller" ? (hot ? "rgba(255,176,32,0.9)" : "rgba(255,176,32,0.55)") : (hot ? "rgba(0,242,254,0.95)" : crosses ? "rgba(0,242,254,0.62)" : "rgba(0,242,254,0.35)");
      context.lineWidth = hot ? 1.8 : crosses ? 1.45 : 1.05;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(bend.x, bend.y, end.x, end.y);
      context.stroke();
    });
    nodes.forEach(function (node) {
      if (!isVisible(node)) return;
      var point = toScreen(node.x, node.y);
      var color = colorFor(node);
      var pulse = selected === node && !reduced ? 1 + Math.sin(time * 3) * 0.08 : 1;
      var radius = node.r * pulse * (hover === node ? 1.35 : 1);
      var glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 6);
      glow.addColorStop(0, color);
      glow.addColorStop(1, "rgba(11,15,25,0)");
      context.fillStyle = glow;
      context.globalAlpha = node.role === "neighbor" ? 0.35 : 0.85;
      context.beginPath();
      context.arc(point.x, point.y, radius * 6, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      traceShape(node, point.x, point.y, radius);
      if (node.role === "neighbor") {
        context.strokeStyle = color;
        context.lineWidth = 1.25;
        context.stroke();
      } else {
        context.fillStyle = color;
        context.fill();
      }
      if (selected === node) {
        context.strokeStyle = "rgba(232,238,248,0.85)";
        context.lineWidth = 1.25;
        context.beginPath();
        context.arc(point.x, point.y, radius + 7, 0, Math.PI * 2);
        context.stroke();
      }
    });
    var taken = [];
    clusters.forEach(function (cluster) {
      if (cluster.kind !== "directory" && cluster.kind !== "logic") return;
      if (!cluster.nodes.some(isVisible)) return;
      var top = null;
      cluster.nodes.forEach(function (node) {
        if (!isVisible(node)) return;
        var point = toScreen(node.x, node.y);
        if (!top || point.y < top.y) top = point;
      });
      if (!top) return;
      paintLabel(cluster.label, top.x, top.y - 28, cluster.kind === "logic" ? "#D2B4FF" : "rgba(0,242,254,0.9)", "12px ui-monospace, monospace", "center", true, taken);
    });
    clusters.forEach(function (cluster) {
      if (cluster.kind !== "file" || cluster.nodes.length < 2 || !cluster.nodes.some(isVisible)) return;
      var point = toScreen(cluster.x, cluster.y);
      paintLabel(cluster.label, point.x, point.y - 22 - cluster.nodes.length * 3, "rgba(0,242,254,0.8)", "11px ui-monospace, monospace", "center", false, taken);
    });
    nodes.forEach(function (node) {
      if (node.role !== "changed" || !isVisible(node)) return;
      var point = toScreen(node.x, node.y);
      var anchor = fileAnchor(node);
      var dx = point.x - anchor.x;
      var dy = point.y - anchor.y;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var forced = node === hover || node === selected;
      paintLabel(trimName(node.name), point.x + (dx / length) * (node.r + 10), point.y + (dy / length) * (node.r + 10) + 4, forced ? "#E8EEF8" : "rgba(232,238,248,0.9)", "12px ui-monospace, monospace", dx >= 0 ? "left" : "right", forced, taken);
    });
    if (looping) requestAnimationFrame(draw);
  }

  function nodeAt(x, y) {
    var found = null;
    var best = Infinity;
    nodes.forEach(function (node) {
      if (!isVisible(node)) return;
      var point = toScreen(node.x, node.y);
      var dx = x - point.x;
      var dy = y - point.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var limit = Math.max(32, node.r * 6 + 14);
      var hit = distance <= limit || (node.role === "changed" && labelContains(node, point, x, y));
      if (!hit || distance >= best) return;
      best = distance;
      found = node;
    });
    return found;
  }

  function labelContains(node, point, x, y) {
    var anchor = fileAnchor(node);
    var dx = point.x - anchor.x;
    var dy = point.y - anchor.y;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    var labelX = point.x + (dx / length) * (node.r + 10);
    var labelY = point.y + (dy / length) * (node.r + 10) + 4;
    var width = Math.min(168, trimName(node.name).length * 7.2);
    var left = dx < 0 ? labelX - width : labelX;
    return x >= left - 8 && x <= left + width + 8 && y >= labelY - 16 && y <= labelY + 8;
  }

  function showTip(node, x, y) {
    if (!tip) return;
    if (!node) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    var width = canvas.clientWidth;
    var left = x + 14;
    if (left > width - 280) left = Math.max(8, x - 280);
    tip.style.left = left + "px";
    tip.style.top = Math.max(8, y + 14) + "px";
    tip.textContent = node.name + " · " + node.path + ":" + node.line;
  }

  function showDetail(node) {
    if (!detail) return;
    detail.textContent = "";
    document.querySelectorAll("[data-index]").forEach(function (button) {
      button.classList.toggle("is-on", node ? Number(button.getAttribute("data-index")) === node.index : false);
    });
    if (!node) {
      addText("p", "Lens", "eyebrow");
      addText("p", "Select a star. Click it again, or the empty sky, to clear it.");
      return;
    }
    addText("p", node.kind + " · " + node.spectral, "eyebrow");
    addText("h2", node.name);
    addText("p", node.path + ":" + node.line, "mono");
    if (node.signature) addText("p", node.signature);
    addText("p", "Complexity " + node.complexity + " (" + signed(node.complexityDelta) + ")");
    if (node.prs.length) addText("p", "PR " + node.prs.join(", "));
    node.findings.forEach(function (finding) {
      addText("p", finding.id + " " + finding.severity + " — " + finding.description, "alert");
    });
    if (node.excerpt) {
      var pre = document.createElement("pre");
      pre.textContent = node.excerpt;
      detail.appendChild(pre);
    }
  }

  function addText(tag, text, className) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    detail.appendChild(element);
  }

  function signed(value) {
    return value > 0 ? "+" + value : String(value);
  }

  function localPoint(event) {
    var bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function zoom(factor) {
    moved = true;
    camera.scale = Math.max(0.34, Math.min(2.8, camera.scale * factor));
    if (reduced) draw();
  }

  canvas.addEventListener("mousemove", function (event) {
    var point = localPoint(event);
    if (down && (Math.abs(point.x - down.x) > 4 || Math.abs(point.y - down.y) > 4)) down.moved = true;
    if (drag) {
      var world = toWorld(point.x, point.y);
      drag.node.x = world.x + drag.dx;
      drag.node.y = world.y + drag.dy;
      if (reduced) draw();
      return;
    }
    if (pan) {
      moved = true;
      camera.x += (point.x - pan.x) / camera.scale;
      camera.y += (point.y - pan.y) / camera.scale;
      pan.x = point.x;
      pan.y = point.y;
      if (reduced) draw();
      return;
    }
    hover = nodeAt(point.x, point.y);
    canvas.style.cursor = hover ? "pointer" : "grab";
    showTip(hover, point.x, point.y);
  });

  canvas.addEventListener("mousedown", function (event) {
    var point = localPoint(event);
    var node = nodeAt(point.x, point.y);
    down = { x: point.x, y: point.y, node: node, was: selected, moved: false };
    if (node) {
      var world = toWorld(point.x, point.y);
      drag = { node: node, dx: node.x - world.x, dy: node.y - world.y };
      if (selected !== node) {
        selected = node;
        showDetail(node);
      }
      return;
    }
    pan = { x: point.x, y: point.y };
  });

  canvas.addEventListener("mouseleave", function () {
    hover = null;
    if (tip) tip.hidden = true;
  });

  window.addEventListener("mouseup", function () {
    if (down && !down.moved) {
      var sameStar = down.node && down.was === down.node;
      if (sameStar || (!down.node && selected)) {
        selected = null;
        showDetail(null);
        if (reduced) draw();
      }
    }
    drag = null;
    pan = null;
    down = null;
  });

  canvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 0.92 : 1.08);
  }, { passive: false });

  sky.addEventListener("keydown", function (event) {
    var step = 48 / camera.scale;
    if (event.key === "ArrowLeft") camera.x += step;
    else if (event.key === "ArrowRight") camera.x -= step;
    else if (event.key === "ArrowUp") camera.y += step;
    else if (event.key === "ArrowDown") camera.y -= step;
    else if (event.key === "+" || event.key === "=") zoom(1.12);
    else if (event.key === "-" || event.key === "_") zoom(0.9);
    else if (event.key === "Escape") {
      if (!selected) return;
      selected = null;
      showDetail(null);
      event.preventDefault();
      if (reduced) draw();
      return;
    } else if (event.key === "0") {
      moved = false;
      fitCamera();
    } else return;
    moved = event.key !== "0";
    event.preventDefault();
    if (reduced) draw();
  });

  var lensIn = document.getElementById("lens-in");
  var lensOut = document.getElementById("lens-out");
  var lensFit = document.getElementById("lens-fit");
  if (lensIn) lensIn.addEventListener("click", function () { zoom(1.15); });
  if (lensOut) lensOut.addEventListener("click", function () { zoom(0.87); });
  if (lensFit) lensFit.addEventListener("click", function () {
    moved = false;
    fitCamera();
    if (reduced) draw();
  });

  document.querySelectorAll("[data-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      filter = button.getAttribute("data-filter") || "all";
      document.querySelectorAll("[data-filter]").forEach(function (item) {
        var on = item === button;
        item.classList.toggle("is-on", on);
        item.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (reduced) draw();
    });
  });

  document.querySelectorAll("[data-index]").forEach(function (button) {
    button.addEventListener("click", function () {
      var index = Number(button.getAttribute("data-index"));
      var node = nodes[index];
      if (!node) return;
      if (selected === node) {
        selected = null;
        showDetail(null);
        if (reduced) draw();
        return;
      }
      selected = node;
      showDetail(node);
      moved = true;
      camera.x = -node.x;
      camera.y = -node.y;
      if (camera.scale < 1) camera.scale = 1;
      if (reduced) draw();
    });
  });

  var symbolFilter = document.getElementById("symbol-filter");
  var indexEmpty = document.getElementById("index-empty");
  if (symbolFilter) {
    symbolFilter.addEventListener("input", function () {
      var query = symbolFilter.value.trim().toLowerCase();
      var visible = 0;
      document.querySelectorAll("[data-index]").forEach(function (button) {
        var match = query.length === 0 || (button.textContent || "").toLowerCase().indexOf(query) !== -1;
        button.hidden = !match;
        if (match) visible += 1;
      });
      if (indexEmpty) indexEmpty.hidden = visible !== 0;
    });
  }

  window.addEventListener("resize", resize);
  showDetail(null);
  resize();
  if (!reduced) {
    looping = true;
    requestAnimationFrame(draw);
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
})();
