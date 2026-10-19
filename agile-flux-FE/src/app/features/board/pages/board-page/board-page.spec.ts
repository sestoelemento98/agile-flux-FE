import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BoardPage } from './board-page';

describe('BoardPage', () => {
  let component: BoardPage;
  let fixture: ComponentFixture<BoardPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardPage],
    }).compileComponents();

    fixture = TestBed.createComponent(BoardPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
