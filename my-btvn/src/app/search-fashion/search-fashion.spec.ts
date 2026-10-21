import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { SearchFashionComponent } from './search-fashion';

describe('SearchFashionComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchFashionComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  it('should create the standalone search screen', () => {
    const fixture = TestBed.createComponent(SearchFashionComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the fashion search heading', async () => {
    const fixture = TestBed.createComponent(SearchFashionComponent);
    await fixture.whenStable();
    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(heading.textContent).toContain('Find your fashion.');
  });
});
